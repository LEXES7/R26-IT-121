/**
 * The photographs the public pages use.
 *
 * Each one is named once here, with its alt text and where it came from, so a
 * picture can be swapped without hunting through pages and its description
 * cannot drift between two places that show it.
 *
 * All but one are from Unsplash, used under the Unsplash licence; `source` is
 * the original, before it was resized to WebP. The analyst at the wall screen
 * came over from the project's research site.
 */

const unsplash = (id) => `https://images.unsplash.com/photo-${id}`

export const PHOTOS = {
  networkLines: {
    src: '/images/network-lines.webp',
    alt: 'A web of lines joining points, like accounts joined by transfers',
    source: unsplash('1545987796-200677ee1011'),
  },
  atmKeypad: {
    src: '/images/atm-keypad.webp',
    alt: 'A hand entering a PIN at a cash machine',
    source: unsplash('1601597111158-2fceff292cdc'),
  },
  circuitScreen: {
    src: '/images/circuit-screen.webp',
    alt: 'A circuit pattern glowing on a dark screen',
    source: unsplash('1550751827-4bd374c3f58b'),
  },
  analystWall: {
    src: '/images/analyst-wall.webp',
    alt: 'An analyst reviewing transaction dashboards on a wall screen',
    source: null,
  },
  serverCorridor: {
    src: '/images/server-corridor.webp',
    alt: 'An engineer working on a laptop in a server corridor lit in blue',
    source: unsplash('1573164713988-8665fc963095'),
  },
  operationsFloor: {
    src: '/images/operations-floor.webp',
    alt: 'A large open-plan operations floor with rows of people at their desks',
    source: unsplash('1504384308090-c894fdcc538d'),
  },
  towers: {
    src: '/images/towers.webp',
    alt: 'Glass office towers seen from street level, looking up',
    source: unsplash('1486406146926-c627a92ad1ab'),
  },
  earthNight: {
    src: '/images/earth-night.webp',
    alt: 'The Earth at night from orbit, its cities lit up',
    source: unsplash('1451187580459-43490279c0fa'),
  },
  cityGolden: {
    src: '/images/city-golden.webp',
    alt: 'A city in golden evening light, seen from above its rooftops',
    source: unsplash('1480714378408-67cf0d13bc1b'),
  },
  payCounter: {
    src: '/images/pay-counter.webp',
    alt: 'A customer paying by phone at a shop counter',
    source: unsplash('1556742049-0cfed4f6a45d'),
  },
  cardTerminal: {
    src: '/images/card-terminal.webp',
    alt: 'A card payment terminal on a shop counter',
    source: unsplash('1556745757-8d76bdb6984b'),
  },
  cardLaptop: {
    src: '/images/card-laptop.webp',
    alt: 'A card held beside a laptop during an online payment',
    source: unsplash('1563013544-824ae1b704d3'),
  },
  phoneBanking: {
    src: '/images/phone-banking.webp',
    alt: 'A banking app open on a phone held in one hand',
    source: unsplash('1616077168712-fc6c788db4af'),
  },
}
