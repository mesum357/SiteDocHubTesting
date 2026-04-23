import type { Job } from "@/types";

const placeholder = (seed: string) =>
  `https://picsum.photos/seed/${encodeURIComponent(seed)}/600/400`;

export const mockJobs: Job[] = [
  {
    id: "job-mill-st",
    name: "Mill St Apts",
    description: "Photo Walk",
    createdAt: "2026-04-21T15:30:00.000Z",
    floors: [
      {
        id: "floor-1",
        name: "Floor 1",
        pins: [
          { id: "p1", name: "Front Entry", x: 0.12, y: 0.78, photoUrl: placeholder("front-entry"), capturedAt: "2026-04-21T17:34:00.000Z", notes: "Door frame plumb. Threshold installed." },
          { id: "p2", name: "Lobby", x: 0.28, y: 0.62, photoUrl: placeholder("lobby"), capturedAt: "2026-04-21T17:41:00.000Z", notes: "" },
          { id: "p3", name: "Unit 1A Kitchen", x: 0.46, y: 0.44, photoUrl: placeholder("1a-kitchen"), capturedAt: "2026-04-21T17:55:00.000Z" },
          { id: "p4", name: "Unit 1A Bedroom", x: 0.58, y: 0.32, photoUrl: placeholder("1a-bed"), capturedAt: "2026-04-21T18:02:00.000Z" },
          { id: "p5", name: "Unit 1B Living", x: 0.72, y: 0.40, photoUrl: placeholder("1b-living"), capturedAt: "2026-04-21T18:14:00.000Z" },
          { id: "p6", name: "Unit 1B Bath", x: 0.84, y: 0.30, photoUrl: placeholder("1b-bath"), capturedAt: "2026-04-21T18:22:00.000Z" },
          { id: "p7", name: "North Stairwell", x: 0.50, y: 0.12, x: 0.50, y: 0.12 } as any,
          { id: "p8", name: "Elevator Lobby", x: 0.36, y: 0.20 },
          { id: "p9", name: "Mechanical Room", x: 0.20, y: 0.30 },
          { id: "p10", name: "Roof Deck Access", x: 0.88, y: 0.78 },
        ].map((p: any) => ({ ...p })) as any,
      },
      {
        id: "floor-2",
        name: "Floor 2",
        pins: [
          { id: "p2-1", name: "Unit 2A Kitchen", x: 0.30, y: 0.40, photoUrl: placeholder("2a-kitchen"), capturedAt: "2026-04-21T19:01:00.000Z" },
          { id: "p2-2", name: "Unit 2A Bath", x: 0.42, y: 0.30, photoUrl: placeholder("2a-bath"), capturedAt: "2026-04-21T19:08:00.000Z" },
          { id: "p2-3", name: "South Corridor", x: 0.60, y: 0.55 },
          { id: "p2-4", name: "Electrical Room", x: 0.80, y: 0.70 },
        ],
      },
    ],
  },
  {
    id: "job-harbor",
    name: "Harbor View Office",
    description: "Punch list walk",
    createdAt: "2026-03-12T18:00:00.000Z",
    archived: true,
    floors: [
      { id: "h-1", name: "Floor 1", pins: [] },
    ],
  },
];
