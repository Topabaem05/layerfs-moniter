/** Whether a session cell can take another run without passing 100% of its budget. */
export function canBook(used: number, percent: number): boolean {
  return used + percent <= 100;
}

export function cellUsed(slots: readonly { cell: number; percent: number }[], cell: number): number {
  return slots.filter((slot) => slot.cell === cell).reduce((sum, slot) => sum + slot.percent, 0);
}
