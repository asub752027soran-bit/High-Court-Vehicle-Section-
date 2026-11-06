import React, { useState, useEffect } from 'react';
import { SheetSettings } from '../types/fuel';
import { Fuel, Check, X, Sliders, RefreshCw } from 'lucide-react';

interface RateSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SheetSettings;
  recordsCount: number;
  onUpdateRates: (rates: { dieselRate: number; petrolRate: number }, updateExisting: boolean) => void;
}

export const RateSettingsModal: React.FC<RateSettingsModalProps> = ({
  isOpen,
  onClose,
  settings,
  recordsCount,
  onUpdateRates,
}) => {
  const [dieselInput, setDieselInput] = useState<string>((settings.dieselRate ?? 94.5).toString());
  const [petrolInput, setPetrolInput] = useState<string>((settings.petrolRate ?? 103.5).toString());
  const [updateExisting, setUpdateExisting] = useState<boolean>(true);

  useEffect(() => {
    if (isOpen) {
      setDieselInput((settings.dieselRate ?? 94.5).toString());
      setPetrolInput((settings.petrolRate ?? 103.5).toString());
      setUpdateExisting(true);
    }
  }, [isOpen, settings.dieselRate, settings.petrolRate]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedDiesel = parseFloat(dieselInput);
    const parsedPetrol = parseFloat(petrolInput);

    const safeDiesel = !isNaN(parsedDiesel) && parsedDiesel > 0 ? parsedDiesel : (settings.dieselRate ?? 94.5);
    const safePetrol = !isNaN(parsedPetrol) && parsedPetrol > 0 ? parsedPetrol : (settings.petrolRate ?? 103.5);

    onUpdateRates(
      {
        dieselRate: safeDiesel,
        petrolRate: safePetrol,
      },
      updateExisting
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Fuel className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-neutral-900 dark:text-neutral-100">
                Fix Current Fuel Rates
              </h3>
              <p className="text-[11px] text-neutral-500">
                Adjust the active rates for Diesel and Petrol
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Diesel Rate */}
          <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
                <span>Diesel Rate ({settings.currencySymbol}/{settings.defaultUnit})</span>
              </label>
              <span className="text-[10px] text-amber-700 dark:text-amber-400 font-mono">
                Fleet Primary
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm font-bold text-amber-900 dark:text-amber-300 font-mono">
                {settings.currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                value={dieselInput}
                onChange={(e) => setDieselInput(e.target.value)}
                className="w-full pl-8 pr-12 py-2 text-base font-mono font-bold bg-white dark:bg-neutral-900 border border-amber-300 dark:border-amber-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 text-neutral-900 dark:text-neutral-100"
                placeholder="94.50"
              />
              <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">
                /{settings.defaultUnit}
              </span>
            </div>
          </div>

          {/* Petrol Rate */}
          <div className="p-3.5 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/80 rounded-xl">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                <span>Petrol Rate ({settings.currencySymbol}/{settings.defaultUnit})</span>
              </label>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-mono">
                OD-05-AN-3893 &amp; Cars
              </span>
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-sm font-bold text-emerald-900 dark:text-emerald-300 font-mono">
                {settings.currencySymbol}
              </span>
              <input
                type="number"
                step="0.01"
                min="0.1"
                required
                value={petrolInput}
                onChange={(e) => setPetrolInput(e.target.value)}
                className="w-full pl-8 pr-12 py-2 text-base font-mono font-bold bg-white dark:bg-neutral-900 border border-emerald-300 dark:border-emerald-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 text-neutral-900 dark:text-neutral-100"
                placeholder="103.50"
              />
              <span className="absolute right-3 top-2.5 text-xs text-neutral-400 font-mono">
                /{settings.defaultUnit}
              </span>
            </div>
          </div>

          {/* Update existing rows toggle */}
          {recordsCount > 0 && (
            <label className="flex items-start gap-2.5 p-3 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-800/40 cursor-pointer">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="mt-0.5 rounded border-neutral-300 text-amber-600 focus:ring-amber-500"
              />
              <div className="text-xs">
                <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                  <RefreshCw className="w-3 h-3 text-amber-600" />
                  <span>Update all {recordsCount} existing rows accordingly</span>
                </div>
                <p className="text-[11px] text-neutral-500 mt-0.5 leading-relaxed">
                  Recalculates <code className="font-mono">Total Amount = Liters × Rate</code> for all existing vouchers in the spreadsheet to match the fixed rates.
                </p>
              </div>
            </label>
          )}

          {/* Footer Buttons */}
          <div className="pt-2 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 dark:bg-amber-500 dark:hover:bg-amber-600 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>Save &amp; Fix Rates</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
