// Intake and processing must be separate committed requests. A crash after the
// first call leaves a durable item for the database retry worker.
export async function acceptReceipt(client, integrationId, event, hash) {
  const intake = await client.rpc('ingest_pos', { p_integration_id: integrationId, p_event: event, p_payload_hash: hash })
  if (intake.error) return intake
  try {
    const processing = await client.rpc('process_pos', { p_integration_id: integrationId, p_inbox_id: intake.data.inboxId })
    if (!processing.error) return processing
  } catch { /* The accepted receipt remains queued after an uncertain response. */ }
  return { data: { ...intake.data, message: 'Receipt retained. Check status before retrying or reconciling.' }, error: null }
}
