import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { TrendingUp, Clock, CheckCircle, AlertTriangle, Users } from 'lucide-react';
import { differenceInDays, parseISO, startOfWeek, endOfWeek, isWithinInterval } from 'date-fns';

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

export default function TeamPerformance({ tasks }) {
    const metrics = useMemo(() => {
        const now = new Date();
        const weekStart = startOfWeek(now);
        const weekEnd = endOfWeek(now);

        // Overall stats
        const completed = tasks.filter(t => t.status === 'completed');
        const overdue = tasks.filter(t => {
            if (!t.due_date || t.status === 'completed') return false;
            return parseISO(t.due_date) < now;
        });
        const thisWeekCompleted = completed.filter(t => {
            if (!t.completed_date) return false;
            const completedDate = parseISO(t.completed_date);
            return isWithinInterval(completedDate, { start: weekStart, end: weekEnd });
        });

        // Completion rate
        const completionRate = tasks.length > 0 ? Math.round((completed.length / tasks.length) * 100) : 0;

        // On-time delivery rate
        const onTimeDeliveries = completed.filter(t => {
            if (!t.due_date || !t.completed_date) return true;
            return parseISO(t.completed_date) <= parseISO(t.due_date);
        });
        const onTimeRate = completed.length > 0 ? Math.round((onTimeDeliveries.length / completed.length) * 100) : 100;

        // Average completion time
        const completionTimes = completed
            .filter(t => t.created_date && t.completed_date)
            .map(t => differenceInDays(parseISO(t.completed_date), parseISO(t.created_date)));
        const avgCompletionDays = completionTimes.length > 0 
            ? Math.round(completionTimes.reduce((a, b) => a + b, 0) / completionTimes.length) 
            : 0;

        // By team member
        const byMember = {};
        tasks.forEach(t => {
            const member = t.assigned_to_name || 'Unassigned';
            if (!byMember[member]) {
                byMember[member] = { total: 0, completed: 0, overdue: 0, hours: 0 };
            }
            byMember[member].total++;
            if (t.status === 'completed') byMember[member].completed++;
            if (t.due_date && parseISO(t.due_date) < now && t.status !== 'completed') {
                byMember[member].overdue++;
            }
            if (t.actual_hours) byMember[member].hours += t.actual_hours;
        });

        const memberData = Object.entries(byMember).map(([name, data]) => ({
            name,
            ...data,
            rate: data.total > 0 ? Math.round((data.completed / data.total) * 100) : 0
        })).sort((a, b) => b.rate - a.rate);

        // By category
        const byCategory = {};
        tasks.forEach(t => {
            const cat = t.category || 'other';
            if (!byCategory[cat]) byCategory[cat] = 0;
            byCategory[cat]++;
        });
        const categoryData = Object.entries(byCategory).map(([name, value]) => ({
            name: name.replace('_', ' '),
            value
        }));

        // By priority
        const byPriority = { low: 0, medium: 0, high: 0, urgent: 0 };
        tasks.forEach(t => {
            byPriority[t.priority || 'medium']++;
        });

        return {
            total: tasks.length,
            completed: completed.length,
            overdue: overdue.length,
            thisWeekCompleted: thisWeekCompleted.length,
            completionRate,
            onTimeRate,
            avgCompletionDays,
            memberData,
            categoryData,
            byPriority
        };
    }, [tasks]);

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="border-0 shadow-lg">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Completion Rate</p>
                                <p className="text-2xl font-bold text-green-600">{metrics.completionRate}%</p>
                            </div>
                            <CheckCircle className="w-8 h-8 text-green-500 opacity-50" />
                        </div>
                        <Progress value={metrics.completionRate} className="mt-2 h-2" />
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">On-Time Rate</p>
                                <p className="text-2xl font-bold text-blue-600">{metrics.onTimeRate}%</p>
                            </div>
                            <Clock className="w-8 h-8 text-blue-500 opacity-50" />
                        </div>
                        <Progress value={metrics.onTimeRate} className="mt-2 h-2" />
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Overdue Tasks</p>
                                <p className="text-2xl font-bold text-red-600">{metrics.overdue}</p>
                            </div>
                            <AlertTriangle className="w-8 h-8 text-red-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>

                <Card className="border-0 shadow-lg">
                    <CardContent className="p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-slate-600">Avg. Completion</p>
                                <p className="text-2xl font-bold text-purple-600">{metrics.avgCompletionDays}d</p>
                            </div>
                            <TrendingUp className="w-8 h-8 text-purple-500 opacity-50" />
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Team Member Performance */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-base">
                            <Users className="w-5 h-5" />
                            Team Performance
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        {metrics.memberData.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">No assigned tasks yet</p>
                        ) : (
                            <div className="space-y-4">
                                {metrics.memberData.slice(0, 5).map((member, idx) => (
                                    <div key={member.name} className="space-y-2">
                                        <div className="flex items-center justify-between text-sm">
                                            <span className="font-medium">{member.name}</span>
                                            <div className="flex items-center gap-2">
                                                <Badge variant="secondary">{member.completed}/{member.total}</Badge>
                                                {member.overdue > 0 && (
                                                    <Badge variant="destructive">{member.overdue} overdue</Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <Progress value={member.rate} className="flex-1 h-2" />
                                            <span className="text-xs font-medium w-10">{member.rate}%</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Tasks by Category */}
                <Card className="border-0 shadow-lg">
                    <CardHeader>
                        <CardTitle className="text-base">Tasks by Category</CardTitle>
                    </CardHeader>
                    <CardContent>
                        {metrics.categoryData.length === 0 ? (
                            <p className="text-slate-500 text-center py-8">No tasks yet</p>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <PieChart>
                                    <Pie
                                        data={metrics.categoryData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={80}
                                        paddingAngle={2}
                                        dataKey="value"
                                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {metrics.categoryData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip />
                                </PieChart>
                            </ResponsiveContainer>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Priority Distribution */}
            <Card className="border-0 shadow-lg">
                <CardHeader>
                    <CardTitle className="text-base">Priority Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                    <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={[
                            { name: 'Low', value: metrics.byPriority.low, fill: '#94a3b8' },
                            { name: 'Medium', value: metrics.byPriority.medium, fill: '#3b82f6' },
                            { name: 'High', value: metrics.byPriority.high, fill: '#f97316' },
                            { name: 'Urgent', value: metrics.byPriority.urgent, fill: '#ef4444' }
                        ]}>
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Bar dataKey="value" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}