import type { Metadata } from "next";
import Landing from "./components/landing";

export const metadata: Metadata = {
  description: "Base reutilizable para lanzar tu próximo SaaS con autenticación y rutas protegidas.",
  robots: { index: true, follow: true },
};

export default function HomePage() { return <Landing />; }
