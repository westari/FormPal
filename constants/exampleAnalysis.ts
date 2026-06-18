// ============================================================
// EXAMPLE FILM ANALYSIS
// Used to populate the Film tab BEFORE the player uploads
// their first clip. Shows what a real Coach X breakdown
// looks like, with realistic copy and real drillIds.
//
// Pattern: Trello's sample board, Grammarly's demo doc.
// "Show what filled looks like before they do the work."
// ============================================================

export interface ExampleFilmAnalysis {
  isExample: true;
  playerLabel: string;
  overallGrade: string;
  openingLine: string;
  summary: string;
  strengths: { skill: string; detail: string }[];
  weaknesses: { skill: string; detail: string }[];
  drillRecommendations: { drillId: string; reason: string }[];
  coachNote: string;
}

export const EXAMPLE_ANALYSIS: ExampleFilmAnalysis = {
  isExample: true,
  playerLabel: 'Sample Player · Point Guard',
  overallGrade: 'B-',
  openingLine: "You're a real point guard. But your handle's predictable — defenders are reading you.",
  summary: "I watched 45 seconds of you running offense. You see the floor well and you make the right pass most of the time. The problem is your dribble — same pace, same moves, no change of speed. That's why you're getting walled off in the lane.",
  strengths: [
    {
      skill: 'Court Vision',
      detail: "You see the kick-out before the defender does. At 0:12, that read to the corner was elite for your age.",
    },
    {
      skill: 'Ball Security',
      detail: "Low turnovers. You protect the ball with your body and don't force passes into traffic.",
    },
    {
      skill: 'Pace Control',
      detail: "You don't rush. You let plays develop. That's a skill most players your age don't have.",
    },
  ],
  weaknesses: [
    {
      skill: 'Dribble Predictability',
      detail: "Same speed every dribble. No hesitation, no change of pace. Defenders sit on you because they know what's coming.",
    },
    {
      skill: 'Weak Hand Attack',
      detail: "You only drive right. Once you turn the corner left, you slow down. They're going to take away your right hand and force you left.",
    },
    {
      skill: 'Finishing Through Contact',
      detail: "When the help defender steps up, you're avoiding contact instead of going through it. You leave easy points at the rim.",
    },
  ],
  drillRecommendations: [
    {
      drillId: 'bh-14',
      reason: "This fixes the predictability. Hesitation is the simplest move in basketball and it'll change your whole game.",
    },
    {
      drillId: 'bh-20',
      reason: "Force yourself to use your weak hand for an entire session. It'll feel terrible. That's the point.",
    },
    {
      drillId: 'fn-3',
      reason: "Two feet, two hands, finish through the bump. We need you initiating contact, not avoiding it.",
    },
    {
      drillId: 'bh-26',
      reason: "Chain three different moves in a row so you stop being a one-trick player.",
    },
  ],
  coachNote: "You've got the brain of a point guard. Now we need to give you the handle to back it up. Upload your film and let's get to work.",
};
