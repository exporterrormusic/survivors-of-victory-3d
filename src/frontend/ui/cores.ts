/** A core amount as shown on price labels: "1 CORE", "5 CORES". */
export const cores = (amount: number): string => `${amount} ${amount === 1 ? 'CORE' : 'CORES'}`;
