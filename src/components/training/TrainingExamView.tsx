import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, XCircle, BookOpen, Award, ArrowRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/hooks/use-toast";
import { useAuditLog } from "@/hooks/useAuditLog";

interface TrainingSession {
  id: string;
  document_id: string;
  status: string;
  score: number | null;
  passed: boolean | null;
  documents?: { title: string; code: string };
}

interface Question {
  id: string;
  question_number: number;
  question_text: string;
  options: { id: string; text: string; isCorrect: boolean }[];
  explanation: string;
}

export function TrainingExamView() {
  const { user } = useAuth();
  const { logAction } = useAuditLog();
  const [sessions, setSessions] = useState<TrainingSession[]>([]);
  const [activeSession, setActiveSession] = useState<TrainingSession | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [answers, setAnswers] = useState<{ questionId: string; isCorrect: boolean }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (user) {
      fetchSessions();
    }
  }, [user]);

  const fetchSessions = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("training_sessions")
      .select(`
        id,
        document_id,
        status,
        score,
        passed,
        documents:document_id (title, code)
      `)
      .eq("user_id", user?.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching sessions:", error);
    } else {
      setSessions(data || []);
    }
    setIsLoading(false);
  };

  const startExam = async (session: TrainingSession) => {
    setActiveSession(session);

    if (session.status === "pending") {
      setIsGenerating(true);
      try {
        const { error } = await supabase.functions.invoke("generate-training-exam", {
          body: {
            sessionId: session.id,
            documentTitle: session.documents?.title || "Procedimiento",
            documentContent: null,
          },
        });

        if (error) throw error;

        toast({
          title: "Examen generado",
          description: "Las preguntas han sido generadas. ¡Buena suerte!",
        });
      } catch (e) {
        console.error("Error generating exam:", e);
        toast({
          title: "Error",
          description: "No se pudo generar el examen",
          variant: "destructive",
        });
        setActiveSession(null);
        setIsGenerating(false);
        return;
      }
      setIsGenerating(false);
    }

    // Fetch questions
    const { data: questionsData } = await supabase
      .from("training_questions")
      .select("*")
      .eq("session_id", session.id)
      .order("question_number");

    if (questionsData) {
      setQuestions(questionsData as unknown as Question[]);
    }
  };

  const handleAnswer = async (optionId: string) => {
    setSelectedAnswer(optionId);
    setShowExplanation(true);

    const question = questions[currentQuestion];
    const isCorrect = question.options.find((o) => o.id === optionId)?.isCorrect || false;

    // Save answer
    await supabase.from("training_answers").insert({
      session_id: activeSession!.id,
      question_id: question.id,
      selected_option_id: optionId,
      is_correct: isCorrect,
    });

    setAnswers([...answers, { questionId: question.id, isCorrect }]);
  };

  const nextQuestion = async () => {
    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
      setSelectedAnswer(null);
      setShowExplanation(false);
    } else {
      // Exam completed
      const correctCount = answers.filter((a) => a.isCorrect).length + 
        (questions[currentQuestion].options.find((o) => o.id === selectedAnswer)?.isCorrect ? 1 : 0);
      const score = Math.round((correctCount / questions.length) * 100);
      const passed = score >= 80;

      await supabase
        .from("training_sessions")
        .update({
          status: "completed",
          score,
          passed,
          completed_at: new Date().toISOString(),
        })
        .eq("id", activeSession!.id);

      toast({
        title: passed ? "¡Felicidades!" : "Examen completado",
        description: passed
          ? `Has aprobado con ${score}%`
          : `Has obtenido ${score}%. Se requiere 80% para aprobar.`,
        variant: passed ? "default" : "destructive",
      });

      // Reset and refresh
      setActiveSession(null);
      setQuestions([]);
      setCurrentQuestion(0);
      setAnswers([]);
      setSelectedAnswer(null);
      setShowExplanation(false);
      fetchSessions();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (activeSession && isGenerating) {
    return (
      <Card className="max-w-2xl mx-auto">
        <CardContent className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-accent mb-4" />
          <p className="text-lg font-medium text-foreground">Generando examen con IA...</p>
          <p className="text-sm text-muted-foreground mt-2">
            Analizando el procedimiento para crear preguntas personalizadas
          </p>
        </CardContent>
      </Card>
    );
  }

  if (activeSession && questions.length > 0) {
    const question = questions[currentQuestion];
    const progress = ((currentQuestion + 1) / questions.length) * 100;

    return (
      <Card className="max-w-2xl mx-auto">
        <CardHeader>
          <div className="flex items-center justify-between mb-2">
            <Badge variant="outline">
              Pregunta {currentQuestion + 1} de {questions.length}
            </Badge>
            <Badge variant="secondary">{activeSession.documents?.code}</Badge>
          </div>
          <Progress value={progress} className="h-2" />
          <CardTitle className="mt-4 text-lg">{question.question_text}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {question.options.map((option) => {
            const isSelected = selectedAnswer === option.id;
            const showResult = showExplanation;
            const isCorrectOption = option.isCorrect;

            return (
              <button
                key={option.id}
                onClick={() => !showExplanation && handleAnswer(option.id)}
                disabled={showExplanation}
                className={`w-full p-4 rounded-lg border text-left transition-all ${
                  showResult
                    ? isCorrectOption
                      ? "border-success bg-success/10"
                      : isSelected
                      ? "border-destructive bg-destructive/10"
                      : "border-border opacity-50"
                    : isSelected
                    ? "border-accent bg-accent/10"
                    : "border-border hover:border-accent/50 hover:bg-secondary/50"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full border flex items-center justify-center font-medium text-sm">
                    {option.id.toUpperCase()}
                  </span>
                  <span className="flex-1">{option.text}</span>
                  {showResult && isCorrectOption && (
                    <CheckCircle className="w-5 h-5 text-success" />
                  )}
                  {showResult && isSelected && !isCorrectOption && (
                    <XCircle className="w-5 h-5 text-destructive" />
                  )}
                </div>
              </button>
            );
          })}

          {showExplanation && (
            <div className="mt-4 p-4 rounded-lg bg-secondary/50 border border-border">
              <p className="text-sm font-medium text-foreground mb-1">Explicación:</p>
              <p className="text-sm text-muted-foreground">{question.explanation}</p>
            </div>
          )}
        </CardContent>
        {showExplanation && (
          <CardFooter>
            <Button onClick={nextQuestion} className="w-full">
              {currentQuestion < questions.length - 1 ? "Siguiente pregunta" : "Finalizar examen"}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Formación y Evaluación</h2>
          <p className="text-sm text-muted-foreground">
            Completa los exámenes de comprensión tras firmar procedimientos
          </p>
        </div>
      </div>

      {sessions.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <BookOpen className="w-12 h-12 text-muted-foreground mb-4" />
            <p className="text-lg font-medium text-foreground">Sin evaluaciones pendientes</p>
            <p className="text-sm text-muted-foreground mt-1">
              Cuando firmes un nuevo procedimiento, aparecerá aquí su evaluación
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <Card key={session.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <Badge
                    variant={
                      session.status === "completed"
                        ? session.passed
                          ? "default"
                          : "destructive"
                        : "secondary"
                    }
                  >
                    {session.status === "completed"
                      ? session.passed
                        ? "Aprobado"
                        : "No aprobado"
                      : "Pendiente"}
                  </Badge>
                  {session.score !== null && (
                    <span className="text-sm font-medium">{session.score}%</span>
                  )}
                </div>
                <CardTitle className="text-base mt-2">
                  {session.documents?.title || "Procedimiento"}
                </CardTitle>
                <CardDescription>{session.documents?.code}</CardDescription>
              </CardHeader>
              <CardFooter>
                {session.status === "completed" ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Award className="w-4 h-4" />
                    <span>Evaluación completada</span>
                  </div>
                ) : (
                  <Button onClick={() => startExam(session)} className="w-full">
                    Iniciar Evaluación
                  </Button>
                )}
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
