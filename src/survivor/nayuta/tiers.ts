import type { TalentSet, TierTalent, TalentAbility } from '../talent-tiers';
const pick = (id: string, name: string, ability: TalentAbility, description: string): TierTalent =>
  ({ id, name, ability, description, icon: ability === 'weapon' ? 'rifle' : ability === 'special' ? 'turret' : 'blast', effects: [id] });
/** Choices reshape formation, absorption and the cycle between them. */
export const NAYUTA_TALENTS: TalentSet = {
  abilities: { weapon: 'Nirvana', special: 'Manifestation / Return', burst: 'White Procession', utility: 'Stillness of Many' },
  tiers: [
    { level: 1, label: 'Discipline', options: [
      { ...pick('return_quest','Return Unto Me','special','Quest: retrieve 20 regular clones.'), effects:[], quest:{event:'clone-return',goal:20,label:'Regular clones retrieved',counts:()=>false,reward:['return_gauge'],rewardName:'Answered Offering',rewardText:'Regular returns grant 3% Burst gauge, rising to 6% with maturity.'}},
      { ...pick('clone_quest','Many Hands','special','Quest: your gold and silver clones earn 60 kills.'), effects:[], quest:{goal:60,label:'Clone kills',counts:k=>k.source==='special'||k.source==='burst',reward:['united_volley'],rewardName:'United Volley',rewardText:'Every 3 s, regular clones fire an empowered volley at your focused target.'}},
      { ...pick('insight_quest','Unbroken Insight','utility','Quest: accumulate 60 seconds at 3 or more Insight. Meditation counts.'), effects:[], quest:{event:'insight-time',goal:60,label:'Seconds at 3+ Insight',counts:()=>false,reward:['shared_insight'],rewardName:'Shared Enlightenment',rewardText:'Clones also gain Insight movement-speed bonuses. Insight damage already affects clones by default.'}},
    ] },
    { level: 4, label: 'Practice', options: [
      pick('deep_insight', 'Deep Insight', 'weapon', 'Each Insight adds 30% damage to Nayuta and her clones instead of 25%.'),
      pick('clone_health', 'Enduring Self', 'special', 'Clones have twice as much health.'),
      pick('commanding_stillness', 'Commanding Stillness', 'utility', 'While meditating, gold and silver clones deal 100% more damage. Summoning, retrieving and Burst preserve meditation.'),
    ] },
    { level: 7, label: 'Experience', options: [
      pick('coordinated_volley', 'One Intent', 'special', 'Clones fire every 0.15 s instead of 0.2 s against your marked target.'),
      pick('lessons_learned', 'Lessons Learned', 'special', 'Clones fully mature after 6 s of combat instead of 12 s.'),
      pick('lasting_insight', 'Lasting Insight', 'weapon', 'Insight lasts 14 s instead of 10 s.'),
    ] },
    { level: 10, label: 'Many and One', options: [
      pick('white_procession','White Procession','burst','Charging silver clones damage and briefly stagger enemies they pass through, once per enemy per clone.'),
      pick('sacred_assembly','Sacred Assembly','burst','The silver army stays around Nayuta as a mobile escort instead of charging toward the cursor.'),
    ] },
    { level: 13, label: 'Flow', options: [
      pick('quick_summon', 'Effortless Form', 'special', 'Manifestation recharges a charge every 4.5 s instead of 6 s.'),
      pick('deep_stillness','Deep Stillness','utility','Meditation doubles summon recharge speed instead of increasing it by 50%.'),
    ] },
    { level: 16, label: 'Unity', options: [
      pick('clone_damage', 'Perfect Reflection', 'special', 'Clones deal twice as much damage.'),
      pick('cycle_return', 'Cycle of Return', 'special', 'Each returning fully mature regular clone restores one Manifestation charge (maximum 3). Silver clones never refund charges.'),
      pick('unshaken', 'Unshaken', 'burst', 'Take 25% less damage while your silver army is active.'),
    ] },
    { level: 20, label: 'Enlightenment', options: [
      pick('twin_self', 'Duality', 'special', 'Each Manifestation creates two clones, up to your clone limit.'),
      pick('endless_procession','Endless Procession','burst','The silver army lasts 12 seconds instead of 8.'),
      pick('return_to_many', 'Return to Many', 'burst', 'When the silver army expires, manifest two free regular clones, respecting your cap.'),
    ] },
  ],
};
