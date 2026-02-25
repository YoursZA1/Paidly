import PropTypes from 'prop-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { ITEM_TYPES, UNIT_TYPES } from './itemTypeHelpers';
import { renderIcon } from "@/utils/renderIcon";

export function ItemTypeSelector({ value, onChange, label = "Item Type" }) {
    const selectedType = ITEM_TYPES.find(t => t.value === value);
    
    return (
        <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">{label} *</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 bg-white">
                    <SelectValue placeholder="Select item type..." />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                    {ITEM_TYPES.map((type) => (
                        <SelectItem 
                            key={type.value} 
                            value={type.value}
                            className="flex items-center gap-3 p-3 rounded-lg hover:bg-blue-50 cursor-pointer"
                        >
                            <div className="flex items-center gap-3 w-full">
                                <span className="text-xl">
                                    {renderIcon(type.icon, { className: "w-5 h-5" })}
                                </span>
                                <div className="flex-1">
                                    <div className="font-medium text-slate-900">{type.label}</div>
                                    <div className="text-xs text-slate-500">{type.description}</div>
                                </div>
                            </div>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
            {selectedType && (
                <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg text-sm text-slate-600">
                    <span className="text-lg inline-flex items-center">
                        {renderIcon(selectedType.icon, { className: "w-5 h-5" })}
                    </span>
                    <span>{selectedType.description}</span>
                </div>
            )}
        </div>
    );
}

ItemTypeSelector.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func,
  label: PropTypes.string,
};

export function UnitTypeSelector({ itemType, value, onChange, label = "Unit" }) {
    const units = UNIT_TYPES[itemType] || UNIT_TYPES.service;
    
    return (
        <div className="space-y-2">
            <Label className="text-sm font-semibold text-slate-700">{label}</Label>
            <Select value={value} onValueChange={onChange}>
                <SelectTrigger className="h-12 rounded-xl border-slate-200 focus:border-blue-500 focus:ring-blue-500/20 bg-white">
                    <SelectValue placeholder="Select unit..." />
                </SelectTrigger>
                <SelectContent className="bg-white border border-slate-200 rounded-xl shadow-lg p-2">
                    {units.map((unit) => (
                        <SelectItem key={unit.value} value={unit.value} className="p-3 rounded-lg hover:bg-blue-50 cursor-pointer">
                            <span className="text-slate-900 font-medium">{unit.label}</span>
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
}

UnitTypeSelector.propTypes = {
  itemType: PropTypes.string,
  value: PropTypes.string,
  onChange: PropTypes.func,
  label: PropTypes.string,
};

export default ItemTypeSelector;
