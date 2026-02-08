import React, { useState, useEffect } from 'react';
import { Notification, User } from '@/api/entities';
import { Bell, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { formatDistanceToNow } from 'date-fns';
import { Link, useNavigate } from 'react-router-dom';
import NotificationService from './NotificationService';
import { Skeleton } from '@/components/ui/skeleton';

export default function NotificationBell() {
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [isLoading, setIsLoading] = useState(true);
    const [user, setUser] = useState(null);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchUserAndNotifications = async () => {
            try {
                const currentUser = await User.me();
                setUser(currentUser);
                if (currentUser) {
                    fetchNotifications(currentUser.id);
                }
            } catch (error) {
                console.log("No user logged in for notifications.");
            } finally {
                setIsLoading(false);
            }
        };
        fetchUserAndNotifications();
    }, []);

    const fetchNotifications = async (userId) => {
        setIsLoading(true);
        try {
            const userNotifications = await Notification.filter({ user_id: userId }, "-created_date", 10);
            setNotifications(userNotifications);
            const unread = userNotifications.filter(n => !n.is_read).length;
            setUnreadCount(unread);
        } catch (error) {
            console.error("Failed to fetch notifications:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleNotificationClick = async (notification) => {
        if (!notification.is_read) {
            await NotificationService.markAsRead(notification.id);
            fetchNotifications(user.id); // Refresh list
        }
        navigate(notification.link);
    };

    const handleMarkAllRead = async (e) => {
        e.stopPropagation();
        if (!user) return;
        await NotificationService.markAllAsRead(user.id);
        fetchNotifications(user.id);
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                    <Bell className="h-5 w-5 text-gray-600" />
                    {unreadCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-xs">
                            {unreadCount}
                        </Badge>
                    )}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel className="flex justify-between items-center">
                    Notifications
                    {unreadCount > 0 && (
                        <Button variant="ghost" size="sm" onClick={handleMarkAllRead} className="h-auto px-2 py-1 text-xs">
                           <CheckCheck className="w-3 h-3 mr-1" /> Mark all as read
                        </Button>
                    )}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {isLoading ? (
                    <div className="p-2 space-y-2">
                        <Skeleton className="h-10 w-full" />
                        <Skeleton className="h-10 w-full" />
                    </div>
                ) : notifications.length === 0 ? (
                    <p className="text-center text-sm text-gray-500 py-4">No notifications yet.</p>
                ) : (
                    notifications.map(n => (
                        <DropdownMenuItem
                            key={n.id}
                            onClick={() => handleNotificationClick(n)}
                            className={`cursor-pointer items-start gap-3 ${!n.is_read ? 'bg-blue-50' : ''}`}
                        >
                            {!n.is_read && <div className="mt-1 h-2 w-2 rounded-full bg-blue-500 flex-shrink-0" />}
                            <div className={`flex-1 ${n.is_read ? 'ml-4' : ''}`}>
                                <p className="font-medium text-sm text-gray-800">{n.title}</p>
                                <p className="text-xs text-gray-500">{n.message}</p>
                                <p className="text-xs text-gray-400 mt-1">
                                    {formatDistanceToNow(new Date(n.created_date), { addSuffix: true })}
                                </p>
                            </div>
                        </DropdownMenuItem>
                    ))
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}