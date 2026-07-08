import { OnlineShopConfig } from '../types/online';

// Shared by the Online Shop dashboard (hero status) and Home's CTA banner —
// a manual override always wins; otherwise follows the weekly schedule.
export function isShopOpenNow(config: OnlineShopConfig): boolean {
  if (config.manualOverride === 'open') return true;
  if (config.manualOverride === 'closed') return false;
  const now = new Date();
  const day = now.getDay() as 0 | 1 | 2 | 3 | 4 | 5 | 6;
  const slot = config.schedule.find((s) => s.day === day);
  if (!slot) return false;
  const [oh, om] = slot.open.split(':').map(Number);
  const [ch, cm] = slot.close.split(':').map(Number);
  const mins = now.getHours() * 60 + now.getMinutes();
  return mins >= oh * 60 + om && mins < ch * 60 + cm;
}
