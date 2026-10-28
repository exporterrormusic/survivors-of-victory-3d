import type { AbilityStage, AbilityTrack } from '../ability-ranks';
import { talents } from '../../characters/rapunzel/talents';

const art = (tree: string) => `ui/survivor/rapunzel-talents/${tree}-${tree === 'weapon' ? 'v2' : 'v1'}.webp`;
function stage(tree: string, ids: string[], icon: string): AbilityStage {
  const entries = ids.map(id => talents.find(t => t.id === id)!);
  return { name: entries.map(t => t.name).join(' + '), description: entries.map(t => t.tooltip).join(' '), effects: ids, icon, art: art(tree) };
}
export const RAPUNZEL_TRACKS: readonly AbilityTrack[] = [
  { id: 'attack', name: 'Holy Grace', art: art('weapon'), ranks: [
    { ...stage('weapon', ['basic_attack'], 'halo'), description: 'Launch a holy halo at the clicked ground position. Bursts into golden light there or on an earlier enemy or terrain collision, dealing damage in a 3.75 m radius.' },
    stage('weapon', ['concussive_blast', 'anti_armor'], 'stun'),
    stage('weapon', ['burning_desire'], 'flame'),
    stage('weapon', ['spread_love', 'it_burns'], 'blast'),
    stage('weapon', ['im_a_healer'], 'goddess'),
  ], capstone: stage('weapon', ['endless_desire'], 'flame') },
  { id: 'skill', name: 'Divine Blessing', art: art('skill'), ranks: [
    stage('skill', ['special'], 'goddess'),
    stage('skill', ['special_power', 'special_size'], 'shield'),
    stage('skill', ['burning_sensation'], 'flame'),
    stage('skill', ['oooh_ahhhh', 'more_more'], 'stun'),
    stage('skill', ['personal_toy'], 'goddess'),
  ], capstone: stage('skill', ['all_the_toys'], 'goddess') },
  { id: 'burst', name: 'Garden of Shangri-La', art: art('burst'), ranks: [
    stage('burst', ['burst'], 'burst'),
    stage('burst', ['burst_stun', 'lingering_light'], 'stun'),
    stage('burst', ['burst_turrets'], 'turret'),
    stage('burst', ['incendiary_rockets', 'extra_stuffed'], 'flame'),
    stage('burst', ['burst_turrets'], 'turret'),
  ], capstone: stage('burst', ['goddess_no_yield'], 'goddess') },
];
