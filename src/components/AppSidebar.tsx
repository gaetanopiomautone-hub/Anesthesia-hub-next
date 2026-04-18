import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Calendar,
  Palmtree,
  BookOpen,
  Archive,
  BarChart3,
  LogOut,
  GraduationCap,
} from "lucide-react";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/" },
  { label: "Calendario Turni", icon: Calendar, path: "/turni" },
  { label: "Ferie e Permessi", icon: Palmtree, path: "/ferie" },
  { label: "Impegni Universitari", icon: GraduationCap, path: "/universita" },
  { label: "Logbook", icon: BookOpen, path: "/logbook" },
  { label: "Archivio Didattico", icon: Archive, path: "/archivio" },
  { label: "Report", icon: BarChart3, path: "/report" },
];

const AppSidebar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <aside className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0 h-screen sticky top-0">
      {/* Logo / Brand */}
      <div className="p-6 flex items-center gap-3">
        <div className="size-8 bg-primary/10 border border-primary/20 flex items-center justify-center rounded-sm">
          <div className="size-2 bg-primary rounded-full glow-blue" />
        </div>
        <div className="leading-none">
          <h1 className="text-foreground font-semibold text-sm tracking-tight">S. DONATO</h1>
          <span className="text-[10px] text-muted-foreground font-mono tracking-widest uppercase">
            Anestesia
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-2 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={isActive ? "sidebar-nav-active w-full" : "sidebar-nav-inactive w-full"}
            >
              <div
                className={`size-1.5 rounded-full ${
                  isActive ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              />
              <item.icon className="size-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-3">
          <div className="size-10 bg-secondary rounded-sm flex items-center justify-center">
            <span className="text-xs font-semibold text-foreground">MV</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">Dr. Marco Volpi</p>
            <p className="text-[10px] font-mono text-muted-foreground uppercase">
              Specializzando III
            </p>
          </div>
          <button className="text-muted-foreground hover:text-foreground transition-colors">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AppSidebar;
