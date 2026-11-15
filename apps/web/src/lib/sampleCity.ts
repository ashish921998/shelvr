export const SAMPLE_CITY = {
  name: "Lisbon",
  pins: [
    { name: "Jardim do Campo Grande", emoji: "🌳", x: 201, y: 96 },
    { name: "Jardim Zoológico", emoji: "🦁", x: 143, y: 149 },
    { name: "Palácio Fronteira", emoji: "🏛️", x: 109, y: 155 },
    { name: "Campo Pequeno", emoji: "🏛️", x: 227, y: 149 },
    { name: "Gulbenkian Museum", emoji: "🏛️", x: 195, y: 172 },
    { name: "Parque Eduardo VII", emoji: "🌳", x: 197, y: 207 },
    { name: "Panorâmico de Monsanto", emoji: "📸", x: 103, y: 217 },
    { name: "Mercado de Arroios", emoji: "🛒", x: 255, y: 203 },
    { name: "Cervejaria Ramiro", emoji: "🍽️", x: 255, y: 238 },
    { name: "Mercado de Campo de Ourique", emoji: "🛒", x: 158, y: 258 },
    { name: "Jardim da Estrela", emoji: "🌳", x: 178, y: 275 },
    { name: "Jardim do Príncipe Real", emoji: "🌳", x: 215, y: 262 },
    { name: "Miradouro da Senhora do Monte", emoji: "📸", x: 278, y: 248 },
    { name: "Castelo de São Jorge", emoji: "🏰", x: 267, y: 270 },
    { name: "Panteão Nacional", emoji: "🏛️", x: 297, y: 269 },
    { name: "Manteigaria", emoji: "🥐", x: 236, y: 280 },
    { name: "Prado", emoji: "🍽️", x: 262, y: 295 },
    { name: "Time Out Market", emoji: "🛒", x: 221, y: 301 },
    { name: "LX Factory", emoji: "🛍️", x: 114, y: 318 },
    { name: "Palácio da Ajuda", emoji: "🏛️", x: 47, y: 301 },
    { name: "Pastéis de Belém", emoji: "🥐", x: 30, y: 340 },
    { name: "Cristo Rei", emoji: "📸", x: 139, y: 428 },
    { name: "Ponto Final", emoji: "🍽️", x: 199, y: 405 },
  ],
  newest: "Ponto Final",
  riverNorth: [
    [-78.3, 377.6],
    [-27.2, 364.5],
    [23.8, 355.8],
    [91.9, 340.5],
    [160, 318.7],
    [228.1, 314.4],
    [258.7, 310],
    [299.6, 290.4],
    [347.2, 259.8],
  ],
  riverSouth: [
    [-78.3, 403.8],
    [23.8, 388.5],
    [117.4, 384.2],
    [177, 392.9],
    [219.6, 388.5],
    [279.1, 408.2],
    [347.2, 443.1],
  ],
  bridge: [
    [118.5, 310.9],
    [119.1, 385.4],
  ],
  roads: [
    {
      width: 6,
      points: [
        [-6.8, 349.3],
        [57.9, 338.4],
        [126, 312.2],
        [190.6, 307.8],
        [231.5, 305.6],
        [258.7, 299.1],
        [304.7, 272.9],
        [330.2, 246.7],
      ],
    },
    {
      width: 6,
      points: [
        [-6.8, 89.7],
        [143, 83.1],
        [313.2, 89.7],
      ],
    },
    {
      width: 6,
      points: [
        [183.8, 229.3],
        [108.9, 207.5],
        [-6.8, 203.1],
      ],
    },
    {
      width: 4.5,
      points: [
        [240, 266.4],
        [211.1, 223.6],
      ],
    },
    {
      width: 4.5,
      points: [
        [211.1, 223.6],
        [226.4, 183.5],
        [227.1, 148.6],
        [216.2, 124.6],
        [202.6, 89.7],
      ],
    },
    {
      width: 4.5,
      points: [
        [258.7, 262],
        [261.4, 203.1],
        [267.2, 150.7],
        [268.9, 89.7],
      ],
    },
    {
      width: 4.5,
      points: [
        [118.5, 312.2],
        [112.3, 246.7],
        [136.2, 181.3],
      ],
    },
  ],
  parks: [
    "M18 150 C 50 132 96 140 108 168 C 120 200 112 246 82 262 C 54 276 22 262 14 232 C 8 204 6 166 18 150 Z",
    "M188 196 C 198 190 210 194 210 206 C 210 218 202 224 194 222 C 186 220 182 204 188 196 Z",
    "M190 86 C 200 82 212 86 212 100 C 212 112 202 116 194 112 C 186 108 184 92 190 86 Z",
  ],
  rows: [
    {
      emoji: "🍽️",
      name: "Ponto Final",
      detail: "Dinner on the water in Cacilhas",
    },
    { emoji: "🏰", name: "Castelo de São Jorge", detail: "3 days in Lisbon" },
  ],
  evening: {
    walkMinutes: 13,
    stops: [
      { slot: "Dinner", name: "Prado" },
      { slot: "Drinks or dessert", name: "Manteigaria" },
    ],
  },
} as const;

export function riverPolygon(): [number, number][] {
  return [
    ...SAMPLE_CITY.riverNorth,
    ...[...SAMPLE_CITY.riverSouth].reverse(),
  ].map(([x, y]): [number, number] => [x, y]);
}

export function sampleCountLine(): string {
  return `${SAMPLE_CITY.pins.length} places from your saves`;
}
