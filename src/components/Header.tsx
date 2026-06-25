import { Zap } from "lucide-react";
import { NavLink } from "react-router-dom";

interface HeaderProps {
  fileName?: string | null;
}

export function Header({ fileName }: HeaderProps) {
  return (
    <header className="surface flex h-14 items-center justify-between border-b border-border px-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-[var(--shadow-glow)]">
          <Zap className="h-5 w-5" strokeWidth={2.5} />
        </div>
        <div>
          <h1 className="text-sm font-semibold leading-tight">Localizador de Postes em PDF</h1>
          <p className="text-xs text-muted-foreground">Engenharia &amp; Fiscalização</p>
        </div>
      </div>
      <nav className="flex items-center gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`
          }
        >
          Localizador
        </NavLink>
        <NavLink
          to="/numerar"
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`
          }
        >
          Numerar PDF
        </NavLink>
        <NavLink
          to="/prints"
          className={({ isActive }) =>
            `rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              isActive ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"
            }`
          }
        >
          Gerar Prints
        </NavLink>
      </nav>
      {fileName && (
        <div className="hidden max-w-[240px] truncate text-xs text-muted-foreground md:block">
          <span className="font-medium text-foreground">Arquivo:</span> {fileName}
        </div>
      )}
    </header>
  );
}
