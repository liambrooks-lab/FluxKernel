import { create } from "zustand";

interface Persona {
  name: string;
  systemPrompt: string;
  intensity: number;
}

interface PersonaState {
  personas: Persona[];
  addPersona: (persona: Persona) => void;
  removePersona: (name: string) => void;
}

export const usePersonaStore = create<PersonaState>((set) => ({
  personas: [],
  addPersona: (persona) => set((state) => ({ personas: [...state.personas, persona] })),
  removePersona: (name) => set((state) => ({ personas: state.personas.filter(p => p.name !== name) }))
}));