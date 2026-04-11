import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users, CreditCard, UserCheck, ClipboardList, Settings, ChevronLeft, ChevronRight, ScrollText, LogOut, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useCurrentUser } from '@/lib/useCurrentUser';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/admin-v2' },
  { label: 'Users', icon: Users, path: '/admin-v2/users' },
  { label: 'Messages', icon: MessageCircle, path: '/admin-v2/messages' },
  { label: 'Subscriptions', icon: CreditCard, path: '/admin-v2/subscriptions' },
  { label: 'Affiliates', icon: UserCheck, path: '/admin-v2/affiliates' },
  { label: 'Waitlist', icon: ClipboardList, path: '/admin-v2/waitlist' },
  { label: 'Audit Log', icon: ScrollText, path: '/admin-v2/audit-log' },
  { label: 'Settings', icon: Settings, path: '/admin-v2/settings' },
];

export default function Sidebar({ collapsed, setCollapsed }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useCurrentUser();
  const { logout } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
      navigate('/login', { replace: true });
      toast.success('Signed out');
    } catch (err) {
      toast.error(err?.message || 'Failed to sign out');
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <aside className={cn('fixed left-0 top-0 h-screen bg-sidebar border-r border-sidebar-border flex flex-col transition-all duration-300 z-50', collapsed ? 'w-[72px]' : 'w-[250px]')}>
      <div className="flex items-center gap-3 px-5 h-16 border-b border-sidebar-border">
        <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
          <img src="/logo.svg" alt="Paidly" className="w-5 h-5" />
        </div>
        {!collapsed && <span className="text-lg font-semibold text-white tracking-tight">Paidly</span>}
      </div>

      <nav className="flex-1 py-4 px-3 space-y-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-medium transition-all duration-200',
                isActive ? 'bg-sidebar-accent text-primary border border-primary/20' : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className={cn('w-4 h-4 flex-shrink-0', isActive && 'text-primary')} />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="px-3 py-2.5 rounded-lg bg-sidebar-accent/70 border border-sidebar-border">
            <p className="text-xs font-medium text-sidebar-accent-foreground truncate">{user?.full_name || user?.email || 'Admin user'}</p>
            <p className="text-[11px] capitalize text-sidebar-foreground/60 mt-0.5">{user?.role || 'admin'}</p>
          </div>
        </div>
      )}

      <div className="px-3 pb-2">
        <button
          onClick={handleLogout}
          disabled={loggingOut}
          className={cn(
            'w-full flex items-center rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
            collapsed ? 'justify-center py-2' : 'gap-2 px-3 py-2'
          )}
          title="Logout"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span className="text-xs">{loggingOut ? 'Signing out...' : 'Logout'}</span>}
        </button>
      </div>

      <div className="px-3 pb-4">
        <button onClick={() => setCollapsed(!collapsed)} className="w-full flex items-center justify-center py-2 rounded-lg text-sidebar-foreground hover:bg-sidebar-accent transition-colors">
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </aside>
  );
}
