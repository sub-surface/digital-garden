/**
 * Hex Life presets. Every object listed under a rule was found by machine, not
 * drawn: an exhaustive run of all 43,605 seeds of three to six cells inside a
 * radius-2 hexagon (plus 300-soup censuses), each classified by when its
 * pattern recurs and whether it has moved. Cells are axial offsets; `dying`
 * holds the Generations cells that are mid-fade (state 2 and up).
 */
export interface HexPattern {
  name: string
  note: string
  cells: ReadonlyArray<readonly [number, number]>
  dying?: ReadonlyArray<readonly [number, number, number]>
}
export interface HexPreset {
  name: string
  rule: string
  density: number
  seed: "soup" | "field" | "mirror"
  blurb: string
  patterns: HexPattern[]
}

export const HEXLIFE_PRESETS: HexPreset[] = [
  {
    name: "Hex Life", rule: "B2/S34", density: 0.35, seed: "soup",
    blurb: "Carter Bays's hexagonal Life. Soups burn down to still lifes and oscillators; no small spaceship turned up among 43,605 seeds.",
    patterns: [
      { name: "p4 spark", note: "Three cells that cycle every four generations: the commonest oscillator in the census.", cells: [[-1,0],[0,1],[2,0]] },
      { name: "p3 ring", note: "Six cells, period 3.", cells: [[-2,1],[-1,-1],[-1,2],[1,-2],[1,1],[2,-1]] },
      { name: "p12", note: "Five cells, period 12: the slowest small clock found.", cells: [[-2,1],[-2,2],[-1,-1],[1,-2],[2,-1]] },
      { name: "p10 rosette", note: "A 39-cell period-10 oscillator that six small seeds grew into.", cells: [[-5,5],[-5,6],[-4,6],[-4,4],[5,-5],[5,6],[5,-3],[5,4],[6,-5],[6,-4],[6,5],[6,4],[-3,5],[-3,4],[-2,4],[-1,3],[-1,4],[0,3],[1,1],[1,2],[1,3],[1,4],[2,1],[2,3],[3,-1],[3,0],[3,1],[3,2],[3,3],[3,4],[4,-4],[4,5],[4,6],[4,-3],[4,-2],[4,-1],[4,1],[4,3],[4,4]] },
    ],
  },
  {
    name: "Gliders", rule: "B2o/S2m34", density: 0.3, seed: "soup",
    blurb: "Shape-aware Life: a cell is born between two neighbours side by side, and survives with two one apart (or three or four). That one distinction is enough for gliders.",
    patterns: [
      { name: "glider", note: "Seven cells, period 4, two cells along an axis each cycle (c/2). The commonest ship among small seeds.", cells: [[-2,0],[-1,0],[0,-1],[0,1],[1,-1],[1,1],[2,-1]] },
      { name: "p8", note: "Six cells, period 8.", cells: [[0,0],[0,2],[1,-1],[1,0],[1,1],[1,2]] },
      { name: "p4", note: "Five cells, period 4.", cells: [[-2,1],[-1,1],[0,1],[1,0],[2,-1]] },
    ],
  },
  {
    name: "Comets", rule: "B2/S2/C3", density: 0.3, seed: "soup",
    blurb: "A Generations rule: a cell that stops living spends one step dying, and the dying cells push everything forward. Comets fly off along the six directions between the lattice's axes.",
    patterns: [
      { name: "comet", note: "Eleven cells (four of them dying), period 6, four cells every six steps along a direction between two axes.", cells: [[-1,3],[1,-2],[1,-1],[1,2],[2,-2],[2,0]], dying: [[-2,3,2],[0,-1,2],[0,2,2],[1,1,2],[2,-1,2]] },
      { name: "long comet", note: "Ten cells, period 6: the same speed and heading in a different shape.", cells: [[0,3],[1,-2],[1,-1],[1,0],[2,-3],[2,-2],[2,1]], dying: [[-1,3,2],[1,2,2],[2,0,2]] },
      { name: "p3 pinwheel", note: "Five cells, period 3.", cells: [[0,-1],[0,0],[0,1]], dying: [[-1,0,2],[1,0,2]] },
      { name: "p9", note: "Fifteen cells, period 9.", cells: [[-2,0],[-2,2],[-1,-2],[-1,1],[-1,3],[0,1],[1,-2],[1,0],[2,-1]], dying: [[-2,1,2],[-2,3,2],[-1,-1,2],[0,-2,2],[0,2,2],[1,-1,2]] },
    ],
  },
  {
    name: "Clocks", rule: "B24/S35", density: 0.35, seed: "soup",
    blurb: "Born with two or four, survives with three or five. Soups settle into a field of small clocks ticking at different periods.",
    patterns: [
      { name: "p4", note: "Four cells, period 4.", cells: [[-2,0],[0,-1],[0,1],[2,0]] },
      { name: "p6", note: "Four in a row, period 6.", cells: [[-1,2],[0,1],[1,0],[2,-1]] },
      { name: "p8", note: "Six cells, period 8.", cells: [[-2,0],[-2,1],[-1,2],[1,-2],[2,-1],[2,0]] },
    ],
  },
  {
    name: "Coral", rule: "B2/S3456", density: 0.18, seed: "mirror",
    blurb: "Survives on almost anything: grows like coral and fills space.",
    patterns: [
    ],
  },
  {
    name: "Maze", rule: "B2/S12345", density: 0.12, seed: "mirror",
    blurb: "Branching corridors that wall off the plane.",
    patterns: [
    ],
  },
  {
    name: "Lace", rule: "B1/S12", density: 0.02, seed: "mirror",
    blurb: "Birth from a single neighbour: one seed becomes filigree.",
    patterns: [
    ],
  },
  {
    name: "Bloom", rule: "B23/S34", density: 0.25, seed: "soup",
    blurb: "Flowering fronts that sweep the torus.",
    patterns: [
    ],
  },
]
