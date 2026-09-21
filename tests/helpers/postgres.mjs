import { mkdtemp, writeFile, unlink, readFile, readdir, realpath, rm, cp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, dirname, basename } from 'node:path'
import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import pg from 'pg'

const run = promisify(execFile)
export async function startTestPostgres() {
  const platform = process.platform === 'win32' ? 'windows' : process.platform
  const binaries = await import(`@embedded-postgres/${platform}-${process.arch}`)
  const root = await mkdtemp(join(tmpdir(), 'pearl-postgres-test-'))
  const rootResolved = await realpath(root), tempResolved = await realpath(tmpdir())
  const dataDir = join(root, 'database'), passwordFile = join(root, 'password')
  const password = randomBytes(32).toString('hex')
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolvePort(assigned)) })
  })
  const command = (binary, args, extra = {}) => binary === binaries.pg_ctl
    ? new Promise((resolve, reject) => {
      // pg_ctl starts a server. Do not wait for inherited stdout pipes to close.
      const child = spawn(binary, args, { windowsHide: true, stdio: 'ignore' })
      const timer = setTimeout(() => { child.kill(); reject(new Error('Test pg_ctl timed out')) }, 60000)
      child.once('error', error => { clearTimeout(timer); reject(error) })
      child.once('exit', code => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Test pg_ctl exited ${code}; inspect ${root}`)) })
    })
    : run(binary, args, { windowsHide: true, timeout: 60000, maxBuffer: 2 * 1024 * 1024, ...extra })
  await writeFile(passwordFile, password + '\n', { mode: 0o600 })
  try {
    await command(binaries.initdb, ['-D', dataDir, '-U', 'postgres', '--encoding=UTF8', '--locale=C', '--auth=scram-sha-256', `--pwfile=${passwordFile}`])
  } finally { await unlink(passwordFile) }
  await command(binaries.pg_ctl, ['-D', dataDir, '-l', join(root, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1 -c max_connections=40`, '-w', 'start'])
  let restoreDir
  const client = async (database = 'postgres', targetPort = port) => {
    const connection = new pg.Client({ host: '127.0.0.1', port: targetPort, user: 'postgres', password, database, connectionTimeoutMillis: 10000, statement_timeout: 20000 })
    await connection.connect(); return connection
  }
  const setup = await client()
  await setup.query('create database pearl_test')
  await setup.end()
  const db = await client('pearl_test')
  await db.query(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth;
    create sequence auth.test_phone;
    create table auth.users(id uuid primary key,email text unique,email_confirmed_at timestamptz,phone text unique default ('614'||lpad(nextval('auth.test_phone')::text,8,'0')),phone_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth,public to anon,authenticated,service_role;
    grant execute on function auth.uid() to anon,authenticated,service_role;`)
  const migrationDir = new URL('../../supabase/migrations/', import.meta.url)
  for (const file of (await readdir(migrationDir)).filter(name => name.endsWith('.sql')).sort()) {
    try { await db.query(await readFile(new URL(file, migrationDir), 'utf8')) }
    catch (error) { await db.end(); await command(binaries.pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop']); throw new Error(`Migration ${file}: ${error.message}`) }
  }
  await db.query("insert into public.policy_versions(kind,version,body) select kind,'test-v1','LOCAL TEST FIXTURE ONLY. These are synthetic policies and must never be published to customers.' from unnest(array['terms','privacy','closure']) kind")
  await db.end()
  return {
    root, client: (database = 'pearl_test') => client(database),
    async restoreCopy() {
      // A cold physical backup is consistent only after a clean server stop.
      // This is an isolated recovery drill, not a backup of the hosted project.
      await command(binaries.pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop'])
      restoreDir = join(root, 'restored-database')
      await cp(dataDir, restoreDir, { recursive: true, errorOnExist: true, force: false })
      await command(binaries.pg_ctl, ['-D', dataDir, '-l', join(root, 'postgres.log'), '-o', `-p ${port} -h 127.0.0.1`, '-w', 'start'])
      const restoredPort = await new Promise((resolvePort, reject) => {
        const server = createServer(); server.once('error', reject)
        server.listen(0, '127.0.0.1', () => { const assigned = server.address().port; server.close(() => resolvePort(assigned)) })
      })
      await command(binaries.pg_ctl, ['-D', restoreDir, '-l', join(root, 'restored.log'), '-o', `-p ${restoredPort} -h 127.0.0.1`, '-w', 'start'])
      return client('pearl_test', restoredPort)
    },
    async stop() {
      if (restoreDir) await command(binaries.pg_ctl, ['-D', restoreDir, '-m', 'fast', '-w', 'stop'])
      await command(binaries.pg_ctl, ['-D', dataDir, '-m', 'fast', '-w', 'stop'])
      // Only remove this test's freshly created, resolved temporary directory.
      const current = await realpath(root)
      if (current !== rootResolved || dirname(current) !== tempResolved || !basename(current).startsWith('pearl-postgres-test-')) throw new Error('Refusing unsafe test cleanup path')
      await rm(current, { recursive: true })
    },
  }
}
