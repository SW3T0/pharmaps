import { useState, useEffect, useCallback, useRef } from 'react';

interface UseVoiceInputProps {
  onTranscript: (text: string) => void;
  onStateChange?: (active: boolean) => void;
}

export function useVoiceInput({ onTranscript, onStateChange }: UseVoiceInputProps) {
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Verificar soporte en el navegador
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'es-ES'; // Configurado para español de España

      recognition.onstart = () => {
        setIsListening(true);
        if (onStateChange) onStateChange(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        if (transcript) {
          onTranscript(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.error('[SpeechRecognition Error]', event.error);
        setIsListening(false);
        if (onStateChange) onStateChange(false);
      };

      recognition.onend = () => {
        setIsListening(false);
        if (onStateChange) onStateChange(false);
      };

      recognitionRef.current = recognition;
    } else {
      console.warn('Este navegador no soporta la Web Speech API nativa.');
    }
  }, [onTranscript, onStateChange]);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      try {
        recognitionRef.current.start();
      } catch (err) {
        console.error('Error al iniciar el reconocimiento de voz:', err);
      }
    } else if (!recognitionRef.current) {
      // Fallback simulado para navegadores no compatibles (como entornos de desarrollo controlados)
      setIsListening(true);
      if (onStateChange) onStateChange(true);
      
      setTimeout(() => {
        const simulatedPhrases = [
          "Planifica una ruta para mañana saliendo de A Coruña y visitando Farmacia Central en Santiago",
          "Quita la farmacia de Milladoiro de la ruta actual",
          "Dime cuáles son las farmacias con visitas pendientes en Santiago de Compostela"
        ];
        const randomPhrase = simulatedPhrases[Math.floor(Math.random() * simulatedPhrases.length)];
        onTranscript(randomPhrase);
        setIsListening(false);
        if (onStateChange) onStateChange(false);
      }, 3000);
    }
  }, [isListening, onTranscript, onStateChange]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
    } else {
      setIsListening(false);
      if (onStateChange) onStateChange(false);
    }
  }, [isListening, onStateChange]);

  const toggleListening = useCallback(() => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }, [isListening, startListening, stopListening]);

  return {
    isListening,
    startListening,
    stopListening,
    toggleListening,
    isSupported: !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)
  };
}
