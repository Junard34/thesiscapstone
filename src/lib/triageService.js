const categoryKeywords = {
  'Public Safety': ['threat', 'fight', 'drunk', 'danger', 'robbery', 'gun', 'unsafe', 'noise', 'public safety', 'security'],
  Infrastructure: ['road', 'drainage', 'flood', 'street', 'water', 'waste', 'electricity', 'light', 'bridge'],
  Health: ['clinic', 'dengue', 'sick', 'medical', 'hospital', 'health', 'sanitation', 'mosquito'],
  Noise: ['loud', 'noise', 'music', 'barking', 'disturbance'],
  'Dispute/Conflict': ['argument', 'dispute', 'conflict', 'quarrel', 'fight', 'land', 'boundary'],
  Threat: ['threat', 'harass', 'intimidate', 'bully', 'attack', 'violent'],
  'Bullying/Harassment': ['bully', 'harassment', 'taunt', 'humiliate', 'threatening messages'],
  'Drug-related concern': ['drug', 'shabu', 'marijuana', 'illegal drugs', 'sale', 'use'],
};

const priorityByCategory = {
  'Public Safety': 'HIGH',
  Threat: 'HIGH',
  'Bullying/Harassment': 'HIGH',
  'Drug-related concern': 'HIGH',
  Infrastructure: 'MEDIUM',
  Health: 'MEDIUM',
  Noise: 'LOW',
  'Dispute/Conflict': 'MEDIUM',
};

export function triageComplaint(text) {
  const normalized = (text || '').toLowerCase();
  let category = 'Public Safety';
  let highestScore = -1;

  for (const [name, keywords] of Object.entries(categoryKeywords)) {
    const score = keywords.reduce((total, keyword) => total + (normalized.includes(keyword) ? 1 : 0), 0);
    if (score > highestScore) {
      highestScore = score;
      category = name;
    }
  }

  const priority = priorityByCategory[category] || 'LOW';

  return {
    category,
    priority,
    confidence: Math.min(0.99, Math.max(0.55, (highestScore + 1) / 6)),
  };
}
