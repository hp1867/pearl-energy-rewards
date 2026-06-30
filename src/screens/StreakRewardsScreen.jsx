import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Flame, Trophy, Star, Car, Award, CheckCircle, Clock, Target, Zap } from 'lucide-react'
import { useApp } from '../context/AppContext'
import { streakRewards } from '../data/mockData'
import { tierTheme } from '../theme/tiers'
import Card3D from '../components/Card3D'

export default function StreakRewardsScreen() {
  const { member, notify } = useApp()
  const [burst, setBurst] = useState(null)

  // Calculate streak progress
  const getStreakProgress = (reward) => {
    if (reward.type === 'fuel_streak') {
      return { current: member.fuelStreak || 0, target: reward.trigger, unit: 'days' }
    } else {
      return { current: member.weeklyFuelCount || 0, target: reward.trigger, unit: 'times this week' }
    }
  }

  const isCompleted = (reward) => {
    const progress = getStreakProgress(reward)
    return progress.current >= progress.target
  }

  const isClaimed = (reward) => {
    return member.streakRewardsClaimed?.includes(reward.id) || false
  }

  const canClaim = (reward) => isCompleted(reward) && !isClaimed(reward)

  const claimReward = async (reward) => {
    if (!canClaim(reward)) return
    setBurst(reward.id)
    
    // Add points
    const customers = JSON.parse(localStorage.getItem('pe_customers') || '{}')
    const c = customers[member.uid]
    if (c) {
      c.points += reward.reward.points
      c.lifetimePoints += reward.reward.points
      c.streakRewardsClaimed = [...(c.streakRewardsClaimed || []), reward.id]
      localStorage.setItem('pe_customers', JSON.stringify(customers))
      window.dispatchEvent(new Event('customer'))
    }
    
    setTimeout(() => setBurst(null), 1500)
    notify(`🎉 Streak reward claimed: ${reward.reward.label}!`)
  }

  const streakRewardsList = streakRewards.map((r) => ({
    ...r,
    progress: getStreakProgress(r),
    completed: isCompleted(r),
    claimed: isClaimed(r),
    canClaim: canClaim(r),
  }))

  return (
    <div className="screen">
      {/* Top app bar */}
      <header className="glass" style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 30, height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px', background: 'rgba(249,249,252,0.8)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--grad-blue)', display: 'grid', placeItems: 'center', color: '#fff', fontWeight: 700, fontSize: 12 }}>
            {member.firstName[0]}{member.lastName[0]}
          </div>
          <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>Streak Rewards</span>
        </div>
      </header>

      <div className="scroll" style={{ paddingTop: 80 }}>
        {/* Current streak status card */}
        <div style={{ padding: '0 20px' }}>
          <Card3D intensity={8} glare>
            <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 24, padding: 24, background: 'linear-gradient(135deg, #ff6b35 0%, #f7931e 100%)', color: '#fff', boxShadow: '0 16px 44px rgba(255,107,53,0.4)' }}>
              <div style={{ position: 'absolute', right: -40, top: -40, width: 150, height: 150, background: 'rgba(255,255,255,0.15)', borderRadius: '50%', filter: 'blur(40px)' }} />
              <div style={{ position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'grid', placeItems: 'center' }}>
                    <Flame size={24} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', opacity: 0.9, textTransform: 'uppercase' }}>Current Fuel Streak</div>
                    <div style={{ fontSize: 48, fontWeight: 800, lineHeight: 1 }}>{member.fuelStreak || 0}</div>
                  </div>
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <div style={{ fontSize: 11, opacity: 0.8 }}>Last refuel</div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{member.lastFuelDate ? new Date(member.lastFuelDate).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}</div>
                  </div>
                </div>
                
                {/* Weekly progress */}
                <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', opacity: 0.9 }}>Weekly Refuels</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{member.weeklyFuelCount || 0} / 6</div>
                  </div>
                  <div style={{ height: 8, background: 'rgba(255,255,255,0.2)', borderRadius: 999, overflow: 'hidden' }}>
                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.min(100, ((member.weeklyFuelCount || 0) / 6) * 100)}%` }} transition={{ duration: 1, ease: 'easeOut' }} style={{ height: '100%', background: '#fff', borderRadius: 999 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6, fontSize: 11, opacity: 0.8 }}>
                    <span>Week started {member.weekStartDate ? new Date(member.weekStartDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'}</span>
                    <span>{6 - (member.weeklyFuelCount || 0)} more for max reward</span>
                  </div>
                </div>
              </div>
            </div>
          </Card3D>
        </div>

        {/* How it works */}
        <div style={{ padding: '20px 20px 0' }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>How Streaks Work</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <StreakRule icon={Flame} color="#ff6b35" title="Daily Streak" desc="Refuel consecutive days to build your flame streak. Miss a day and it resets.">
              <ul style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
                <li>3 days → 200 bonus points</li>
                <li>7 days → 500 bonus points</li>
              </ul>
            </StreakRule>
            <StreakRule icon={Target} color="#0057B8" title="Weekly Target" desc="Count resets every Monday. Hit the weekly targets for bigger rewards.">
              <ul style={{ marginTop: 10, fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.8 }}>
                <li>4 refuels → 300 bonus points</li>
                <li>6 refuels → Free car wash + 250 pts</li>
              </ul>
            </StreakRule>
          </div>
        </div>

        {/* Rewards */}
        <div className="section-title" style={{ marginTop: 24 }}><h3>Available Rewards</h3></div>
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {streakRewardsList.map((r, i) => (
            <motion.div key={r.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }}>
              <StreakRewardCard reward={r} onClaim={() => claimReward(r)} burst={burst === r.id} />
            </motion.div>
          ))}
        </div>
      </div>

      {/* Claim burst animation */}
      <AnimatePresence>
        {burst && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'grid', placeItems: 'center', background: 'rgba(8,22,48,.4)', backdropFilter: 'blur(3px)' }}>
            <motion.div initial={{ scale: 0.4, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 220, damping: 14 }}
              style={{ background: '#fff', borderRadius: 24, padding: '34px 30px', textAlign: 'center', boxShadow: 'var(--shadow-md)' }}>
              <motion.div animate={{ rotate: [0, -10, 10, 0] }} transition={{ repeat: 2, duration: 0.5 }} style={{ fontSize: 64 }}>🔥</motion.div>
              <h3 style={{ marginTop: 10, fontSize: 20 }}>Streak Reward Claimed!</h3>
              <p style={{ color: 'var(--muted)', marginTop: 4, fontSize: 14 }}>Bonus points added to your balance</p>
            </motion.div>
            {[...Array(14)].map((_, k) => (
              <motion.div key={k} initial={{ x: 0, y: 0, opacity: 1 }}
                animate={{ x: (Math.random() - 0.5) * 320, y: (Math.random() - 0.5) * 520, opacity: 0, rotate: Math.random() * 360 }}
                transition={{ duration: 1.2, ease: 'easeOut' }} style={{ position: 'absolute', fontSize: 22 }}>{['🔥', '⭐', '🏆', '⚡'][k % 4]}</motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function StreakRule({ icon: Icon, color, title, desc, children }) {
  return (
    <div style={{ background: '#fff', borderRadius: 16, padding: 16, boxShadow: 'var(--shadow-sm)', border: '1px solid rgba(194,198,212,0.3)' }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: `${color}1a`, display: 'grid', placeItems: 'center', color: color, marginBottom: 12 }}>
        <Icon size={20} />
      </div>
      <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }}>{title}</h4>
      <p style={{ fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.5, marginBottom: 10 }}>{desc}</p>
      {children}
    </div>
  )
}

function StreakRewardCard({ reward, onClaim, burst }) {
  const progressPct = Math.min(100, (reward.progress.current / reward.progress.target) * 100)
  const IconMap = { Flame, Trophy, Star, Car }
  const Icon = IconMap[reward.reward.icon] || Award
  
  return (
    <Card3D intensity={6} glare>
      <div style={{ position: 'relative', overflow: 'hidden', borderRadius: 20, background: '#fff', boxShadow: 'var(--shadow-md)', border: '1px solid rgba(226,226,229,0.5)' }}>
        {/* Progress bar at top */}
        <div style={{ height: 4, background: reward.claimed ? 'linear-gradient(90deg, #1e8e4e, #27ae60)' : reward.canClaim ? 'linear-gradient(90deg, #f37021, #ff9f1c)' : 'var(--surface-variant)', borderRadius: '20px 20px 0 0' }}>
          <motion.div initial={{ width: 0 }} animate={{ width: `${progressPct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} style={{ height: '100%', borderRadius: '20px 0 0 0', background: reward.claimed ? 'linear-gradient(90deg, #1e8e4e, #27ae60)' : reward.canClaim ? 'linear-gradient(90deg, #f37021, #ff9f1c)' : 'var(--primary)', opacity: reward.claimed || reward.canClaim ? 1 : 0.3 }} />
        </div>

        <div style={{ padding: 20, display: 'flex', gap: 16 }}>
          <div style={{ width: 56, height: 56, borderRadius: 16, background: `linear-gradient(135deg, ${reward.accent || '#0057B8'}, ${reward.accent || '#4DA3FF'})`, display: 'grid', placeItems: 'center', flexShrink: 0, boxShadow: '0 8px 24px rgba(0,87,184,0.3)' }}>
            <Icon size={28} color="#fff" />
          </div>
          
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <h4 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)' }}>{reward.title}</h4>
              {reward.claimed && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#e7f7ee', color: '#1e8e4e' }}>✓ Claimed</span>}
              {reward.canClaim && !reward.claimed && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#fff4e5', color: '#b9742f' }}>Ready to Claim</span>}
              {!reward.completed && !reward.claimed && <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: 'var(--surface-c)', color: 'var(--muted)' }}>{reward.progress.current}/{reward.progress.target} {reward.progress.unit}</span>}
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--ink-soft)', lineHeight: 1.4, marginBottom: 8 }}>{reward.description}</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 999, background: 'var(--surface-low)', fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                <Zap size={12} /> +{reward.reward.points.toLocaleString()} pts
              </div>
              {reward.reward.label.includes('Car Wash') && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 999, background: 'linear-gradient(135deg, #6c3483, #8e44ad)', color: '#fff', fontSize: 11, fontWeight: 700 }}>
                  <Car size={10} /> Free Car Wash
                </div>
              )}
            </div>
          </div>

          {/* Claim button */}
          <button 
            onClick={onClaim}
            disabled={!reward.canClaim || reward.claimed}
            style={{ 
              padding: '12px 20px', 
              borderRadius: 12, 
              fontWeight: 700, 
              fontSize: 13,
              display: 'flex', 
              alignItems: 'center', 
              gap: 6,
              flexDirection: 'column',
              background: reward.claimed ? 'var(--muted)' : reward.canClaim ? 'linear-gradient(135deg, #f37021, #ff9f1c)' : 'var(--surface-c)',
              color: reward.claimed ? '#fff' : reward.canClaim ? '#fff' : 'var(--muted)',
              boxShadow: reward.canClaim ? '0 6px 20px rgba(243,112,33,0.4)' : 'none',
              opacity: reward.claimed ? 0.7 : 1,
            }}
          >
            {reward.claimed ? (
              <>
                <CheckCircle size={16} /> Claimed
              </>
            ) : reward.canClaim ? (
              <>
                <Award size={16} /> Claim
              </>
            ) : (
              <>
                <Clock size={16} /> In Progress
              </>
            )}
          </button>
        </div>

        {/* Progress detail */}
        <div style={{ padding: '0 20px 16px', display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--muted)' }}>
          <span>{reward.type === 'fuel_streak' ? '🔥 Daily streak' : '📅 Weekly target'}</span>
          <span>{reward.progress.current} / {reward.progress.target} {reward.progress.unit}</span>
        </div>
      </div>
    </Card3D>
  )
}

function getStreakProgress(reward, member) {
  if (reward.type === 'fuel_streak') {
    return { current: member.fuelStreak || 0, target: reward.trigger, unit: 'days' }
  } else {
    return { current: member.weeklyFuelCount || 0, target: reward.trigger, unit: 'times this week' }
  }
}

function isCompleted(reward, member) {
  const progress = getStreakProgress(reward, member)
  return progress.current >= progress.target
}

function isClaimed(reward, member) {
  return member.streakRewardsClaimed?.includes(reward.id) || false
}

function canClaim(reward, member) {
  return isCompleted(reward, member) && !isClaimed(reward, member)
}