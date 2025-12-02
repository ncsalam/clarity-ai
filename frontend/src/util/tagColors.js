// --- PREDEFINED TAG COLORS ---
const predefinedColors = [
  // priority
  { match: 'high priority', color: '#ff0000ff' },    
  { match: 'medium priority', color: '#f9c700ff' },  
  { match: 'low priority', color: '#47fc00ff' },     

  // categories
  { match: 'security', color: '#800af6ff' },         
  { match: 'ux', color: '#0674fbff' },               
  { match: 'ui', color: '#051675ff' },               
  { match: 'authentication', color: '#085404ff' },   
  { match: 'performance', color: '#e879f9' },      
];

// --- RANDOM COLORS (used only when tag doesn't match predefined) ---
const randomPalette = [
  '#f87171', '#fb923c', '#fbbf24', '#00ffddff', '#bfff00ff',
  '#2dd4bf', '#38bdf8', '#60a5fa', '#818cf8', '#a78bfa',
  '#c084fc', '#e879f9', '#f472b6'
];

// GLOBAL map that persists during the app lifetime
const tagColorCache = new Map();

// Track which colors have been used
const usedColors = new Set();

// Utility to pick a random palette color that hasn't been used yet
const getRandomPaletteColor = () => {
  // Filter out colors that have already been used
  const availableColors = randomPalette.filter(color => !usedColors.has(color));
  
  // If all colors are used, reset and start over
  if (availableColors.length === 0) {
    usedColors.clear();
    const color = randomPalette[Math.floor(Math.random() * randomPalette.length)];
    usedColors.add(color);
    return color;
  }
  
  // Pick a random color from available colors
  const color = availableColors[Math.floor(Math.random() * availableColors.length)];
  usedColors.add(color);
  return color;
};

export function getTagColor(tagName) {
  const lower = tagName.toLowerCase();

  // 1. Check predefined mappings
  for (const rule of predefinedColors) {
    if (lower.includes(rule.match)) {
      return rule.color;
    }
  }

  // 2. Return cached random color (if available)
  if (tagColorCache.has(lower)) {
    return tagColorCache.get(lower);
  }

  // 3. Otherwise generate and store one random color
  const newColor = getRandomPaletteColor();
  tagColorCache.set(lower, newColor);
  return newColor;
}