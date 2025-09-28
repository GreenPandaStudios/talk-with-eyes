import { useState, useCallback } from 'react';
import OpenAI from 'openai';

interface UseOpenAIProps {
  apiKey?: string;
}

interface UseOpenAIReturn {
  processPhoneticInput: (phoneticText: string, targetLanguage?: string) => Promise<string>;
  isProcessing: boolean;
  error: string | null;
  setApiKey: (key: string) => void;
}

export const useOpenAI = ({ apiKey: initialApiKey }: UseOpenAIProps = {}): UseOpenAIReturn => {
  const [apiKey, setApiKey] = useState<string | undefined>(initialApiKey);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processPhoneticInput = useCallback(async (phoneticText: string, targetLanguage: string = 'english'): Promise<string> => {
    if (!apiKey) {
      setError('OpenAI API key is required');
      throw new Error('OpenAI API key is required');
    }

    try {
      setIsProcessing(true);
      setError(null);
      
      const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
      
      const prompt = `
        Convert the following phonetic sounds into natural language in ${targetLanguage}.
        The input is simplified phonetic sounds from someone using eye tracking to communicate.
        Try to understand the intended meaning even if it's not perfectly clear.

        Add spaces and punctuation as needed. Understand the context to form coherent sentences.
        If the input is unclear, make the best guess based on common phrases and context.

        Additionally, correct common phonetic ambiguities:
        - "th" can be "the", "this", "that", or "there" based on context.
        - "a" can be "a" or "uh".
        - "i" can be "I" or "eye".
        - "to" can be "to", "too", or "two".
        - "for" can be "for" or "four".
        - "you" can be "you" or "u".
        - "be" can be "be" or "bee".
        - "see" can be "see" or "sea".
        - "no" can be "no" or "know".
        - "one" can be "one" or "won".
        - "right" can be "right" or "write".

        
        Phonetic input: "${phoneticText}"

        DO NOT return any explanations, only return the converted text.
        
        Converted natural language:
      `;

      const response = await openai.chat.completions.create({
        model: "gpt-5-nano",
        messages: [{ role: "user", content: prompt }],
      });

      const result = response.choices[0]?.message?.content?.trim() || "";

   
        playOpenAITTS(result);
      

      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      throw err;
    } finally {
      setIsProcessing(false);
    }
  }, [apiKey]);


  const playOpenAITTS = useCallback((text: string) => {
    const openai = new OpenAI({ apiKey, dangerouslyAllowBrowser: true });
    openai.audio.speech.create({ model: "gpt-4o-mini-tts", voice: "echo", response_format: "mp3", input: text,
        instructions:
        "Very clearly enunciate everything so that there is no confusion." +
        "Correct any typos. Read it in the provided language." +
        "It was a lot of effort for someone to give this to you. Be kind and speak clearly."
     })
      .then(async (response) => {
        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);
        audio.play().catch(err => {
          console.error('Error playing audio:', err);
        });
      })
      .catch(err => {
        console.error('Error generating speech:', err);
      });
  }, [apiKey]);


  return {
    processPhoneticInput,
    isProcessing,
    error,
    setApiKey
  };
};