import type { FormEvent } from "react";
import { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { User, KeySquare } from "lucide-react";
import { Button } from "@/shared/components/ui/button";
import { Field } from "@/shared/components/ui/field";
import {
  InputGroup,
  InputGroupInput,
  InputGroupAddon,
} from "@/shared/components/ui/input-group";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/shared/components/ui/card";
import { Spinner } from "@/shared/components/ui/spinner";
import { toast } from "@/shared/hooks/use-toast";

export function LoginPage() {
  const { login, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Redirect if already authenticated
  if (isAuthenticated && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      await login({ username, password });
      toast({
        title: "Connexion réussie",
        description: `Bienvenue ${username}`,
      });
      navigate("/");
    } catch (error) {
      toast({
        title: "Erreur de connexion",
        description:
          error instanceof Error ? error.message : "Identifiants invalides",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        Chargement...
      </div>
    );
  }

  return (
    <div className="flex place-items-start justify-center min-h-screen">
      <Card className="w-full max-w-sm overflow-hidden mt-14 shadow-xl border-none">
        <CardHeader className="p-0 mb-10">
          <div className="flex flex-col items-center justify-center py-2 mb-10 bg-muted/40 border-b">
            <img
              src="/favicon.svg"
              alt="TebroShelf Logo"
              className="w-14 h-14"
            />
          </div>
          <CardTitle className="flex justify-center items-center font-sans font-thin text-4xl tracking-widest uppercase">
            TebroShelf
          </CardTitle>
        </CardHeader>
        <CardContent className="mx-4">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Field>
              <InputGroup>
                <InputGroupInput
                  id="username"
                  type="text"
                  placeholder="Nom d'utilisateur"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                  disabled={isSubmitting}
                />
                <InputGroupAddon>
                  <User />
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <Field>
              <InputGroup>
                <InputGroupInput
                  type="password"
                  placeholder="Mot de passe"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={isSubmitting}
                />
                <InputGroupAddon>
                  <KeySquare />
                </InputGroupAddon>
              </InputGroup>
            </Field>
            <div className="pt-6">
              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Spinner />
                    Connexion...
                  </>
                ) : (
                  "Se connecter"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
