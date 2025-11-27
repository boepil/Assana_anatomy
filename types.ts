export type Region = 'upper-body' | 'trunk' | 'lower-body';

export interface QuizOption {
  id: string;
  text: string;
  correct: boolean;
}

export interface Asana {
  id: string;
  name: string;
  aliases: string[];
  quizOptions: QuizOption[]; // Default options (usually upper body)
}

export interface RegionOverride {
  trunk?: QuizOption[];
  lower?: QuizOption[];
}

export interface WrongAnswer {
  asanaId: string;
  chosenId: string;
  correctOption: QuizOption;
  category: Region;
}

export interface QuestionHistoryItem {
  asanaId: string;
  asanaName: string;
  category: Region;
  chosenId: string;
  correctOption: QuizOption;
  correct: boolean;
  questionNumber: number;
}
