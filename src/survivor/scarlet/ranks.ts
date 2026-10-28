import type { AbilityStage, AbilityTrack } from '../ability-ranks';
import { talents } from '../../characters/scarlet/talents';

const art = (tree: string) => `ui/survivor/scarlet-talents/${tree}-v1.webp`;
function stage(tree: string, ids: string[], icon: string): AbilityStage {
  const entries = ids.map(id => talents.find(t => t.id === id)!);
  return { name: entries.map(t => t.name).join(' + '), description: entries.map(t => t.tooltip).join(' '), effects: ids, icon, art: art(tree) };
}
/** Legacy talents, adapted into the same 30-SP ordered progression as Snow White. */
export const SCARLET_TRACKS: readonly AbilityTrack[] = [
  { id: 'attack', name: 'Fleetly Fading', art: art('weapon'), ranks: [
    stage('weapon', ['basic_attack'], 'sword'),
    stage('weapon', ['eviscerate'], 'blood'),
    { ...stage('weapon', ['parry', 'dodge'], 'shield'), name: 'Parry',
      description: "Enemy bullets caught in your sword's arc are knocked straight back the way they came. Dashing (Shift) lets Scarlet pass through enemies. Walls and terrain still block her." },
    { ...stage('weapon', ['evasion', 'retaliation'], 'shield'), name: 'Retaliation' },
    stage('weapon', ['roses_core'], 'petal'),
  ], capstone: stage('weapon', ['i_am_cheating'], 'sword') },
  { id: 'skill', name: 'Dash Slash', art: art('skill'), ranks: [
    stage('skill', ['special'], 'wave'),
    stage('skill', ['special_heal'], 'blood'),
    stage('skill', ['nothing_personal'], 'chevrons'),
    { ...stage('skill', ['no_hard_feelings', 'surprise'], 'blast'), name: 'No Hard Feelings' },
    stage('skill', ['musashi'], 'wave'),
  ], capstone: stage('skill', ['in_one_strike'], 'blast') },
  { id: 'burst', name: 'Scarlet Flash', art: art('burst'), ranks: [
    stage('burst', ['burst'], 'burst'),
    stage('burst', ['burst_execute', 'drink_to_victory'], 'blood'),
    stage('burst', ['low_hp_damage'], 'blood'),
    stage('burst', ['expose_weakness', 'fire_in_my_veins'], 'focus'),
    stage('burst', ['d1_crashout'], 'stun'),
  ], capstone: stage('burst', ['goddess_no_yield'], 'goddess') },
];
