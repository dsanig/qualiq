import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface ErrorBoundaryProps {
  children: ReactNode;
  title?: string;
  description?: string;
  retryLabel?: string;
  onRetry?: () => void;
  resetKeys?: unknown[];
}

interface ErrorBoundaryState {
  hasError: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const isDev =
      (typeof import.meta !== "undefined" && import.meta.env?.DEV) ||
      (typeof process !== "undefined" && process.env?.NODE_ENV === "development");

    if (isDev) {
      console.error("[ErrorBoundary] Uncaught render error", {
        route: typeof window !== "undefined" ? window.location.pathname : "unknown",
        message: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps) {
    if (!this.state.hasError) return;

    const currentReset = this.props.resetKeys ?? [];
    const prevReset = prevProps.resetKeys ?? [];
    const hasResetChange =
      currentReset.length !== prevReset.length ||
      currentReset.some((value, index) => !Object.is(value, prevReset[index]));

    if (hasResetChange) {
      this.setState({ hasError: false });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false });
    this.props.onRetry?.();
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle>{this.props.title ?? "Ha ocurrido un error"}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {this.props.description ?? "No se pudo renderizar esta sección. Inténtalo de nuevo."}
          </p>
          <Button onClick={this.handleRetry}>{this.props.retryLabel ?? "Reintentar"}</Button>
        </CardContent>
      </Card>
    );
  }
}
