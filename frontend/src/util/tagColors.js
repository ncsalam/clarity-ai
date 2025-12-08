// --- PREDEFINED TAG COLORS ---
const predefinedColors = [
  // priority
  { match: 'high priority', color: '#d62728' },    
  { match: 'medium priority', color: '#f9c700ff' },  
  { match: 'low priority', color: '#2ca02c' },     

  // categories
  { match: 'security', color: '#9467bd' },         
  { match: 'ux', color: '#17befc' },               
  { match: 'ui', color: '#051675ff' },               
  { match: 'authentication', color: '#085404ff' },   
  { match: 'performance', color: '#e377c2' },      
];

// --- RANDOM COLORS (used only when tag doesn't match predefined) ---
const randomPalette = [
  '#00FFD1', 
  '#FF6F00', 
  '#00A1FF', 
  '#FF00A8', 
  '#7FFF00', 
  '#8c00ff53', 
  '#ff004c36', 
  '#00FF66', 
  '#FFB300', 
  '#004CFF', 
  '#FF8500',
  '#00FFE1', 
  '#B200FF'  
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