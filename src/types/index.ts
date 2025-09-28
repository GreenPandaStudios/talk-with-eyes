
export interface ISpecialActions {
  space: string;
  delete: string;
  submit: string;
}

export interface ILetterZone {
  label: string;
  letters: string[];
  hint?: string;
}

export interface IAlphabet {
  zones: ILetterZone[];
  specialActions: ISpecialActions;
  backLabel: string;
}

export type languages = 'english' | 'spanish';