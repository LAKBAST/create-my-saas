import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import styles from "../auth.module.css";
import { AuthCard } from "../components/auth-card";
import { ApiError, api } from "../lib/api.client";
import { privatePageMetadata } from "../lib/seo";

export function meta() { return privatePageMetadata({ title: "Verificar correo", description: "Verifica el correo electrónico de tu cuenta.", path: "/verify-email" }); }

export default function VerifyEmail() {
  const [search] = useSearchParams();
  const token = search.get("token");
  const [state, setState] = useState<"loading" | "complete" | "error">("loading");
  const [message, setMessage] = useState("Verificando tu correo…");

  // A missing token is derived while rendering; only the request's outcome is state.
  useEffect(() => {
    if (!token) return;
    void api.verifyEmail(token).then(() => { setMessage("Tu correo se ha verificado correctamente."); setState("complete"); }).catch((cause) => {
      setMessage(cause instanceof ApiError ? cause.message : "No se ha podido verificar el correo."); setState("error");
    });
  }, [token]);

  const invalidLink = !token;
  return <AuthCard><h1>{state === "complete" ? "Correo verificado" : "Verificación de correo"}</h1><p role="status">{invalidLink ? "El enlace de verificación no es válido." : message}</p>{(state !== "loading" || invalidLink) && <p className={styles.footer}><Link to="/login">Iniciar sesión</Link></p>}</AuthCard>;
}
