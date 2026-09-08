import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function DateRangePicker({ value = "monthly", onChange }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-10 w-[150px] rounded-xl">
        <SelectValue placeholder="Period" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="daily">Today</SelectItem>
        <SelectItem value="weekly">Last 7 days</SelectItem>
        <SelectItem value="monthly">This month</SelectItem>
        <SelectItem value="yearly">This year</SelectItem>
      </SelectContent>
    </Select>
  );
}
