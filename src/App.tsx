import React, { useState, useMemo } from 'react';
import { useFuelRecords } from './hooks/useFuelRecords';
import { ViewMode, FilterState, SortConfig } from './types/fuel';
import { filterAndSortRecords, exportRecordsToCsv, getTodayDateString } from './utils/fuelUtils';
import { TopNavigation } from './components/TopNavigation';
import { FleetStatsStrip } from './components/FleetStatsStrip';
import { QuickEntryBar } from './components/QuickEntryBar';
import { FilterControls } from './components/FilterControls';
import { SpreadsheetTable } from './components/SpreadsheetTable';
import { RapidEntryView } from './components/RapidEntryView';
import { FleetSummaryView } from './components/FleetSummaryView';
import { AnalyticsView } from './components/AnalyticsView';
import { CsvImportModal } from './components/CsvImportModal';
import { PrintManifestModal } from './components/PrintManifestModal';
import { SettingsModal } from './components/SettingsModal';
import { RateSettingsModal } from './components/RateSettingsModal';

export default function App() {
  const {
    records,
    settings,
    knownVehicles,
    suggestedNextCoupon,
    addRecord,
    updateRecord,
    deleteRecord,
    deleteMultiple,
    duplicateRecord,
    importRecords,
    resetToDemo,
    clearAll,
    updateSettings,
    updateRates,
    isLiveConnected,
    currentUser,
    signInWithGoogle,
    signOutUser,
  } = useFuelRecords();

  const [currentView, setCurrentView] = useState<ViewMode>('spreadsheet');
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isRateModalOpen, setIsRateModalOpen] = useState(false);

  const [filter, setFilter] = useState<FilterState>({
    searchQuery: '',
    vehicleFilter: 'all',
    dateRange: 'all',
    fuelTypeFilter: 'all',
    statusFilter: 'all',
  });

  const [sortConfig, setSortConfig] = useState<SortConfig>({
    column: 'date',
    direction: 'desc',
  });

  // Filter and sort records for table display
  const filteredRecords = useMemo(
    () => filterAndSortRecords(records, filter, sortConfig),
    [records, filter, sortConfig]
  );

  const handleSortChange = (col: keyof typeof records[0]) => {
    setSortConfig((prev) => ({
      column: col,
      direction: prev.column === col && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100 flex flex-col font-sans">
      {/* 1. Header Navigation */}
      <TopNavigation
        currentView={currentView}
        onViewChange={setCurrentView}
        onOpenQuickAdd={() => {
          setCurrentView('spreadsheet');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onExportCsv={() => exportRecordsToCsv(filteredRecords, `fuel_voucher_ledger_${getTodayDateString()}.csv`)}
        onOpenImport={() => setIsImportModalOpen(true)}
        onOpenPrint={() => setIsPrintModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        totalRecordsCount={records.length}
        isLiveConnected={isLiveConnected}
        currentUser={currentUser}
        onSignIn={signInWithGoogle}
        onSignOut={signOutUser}
      />

      {/* 2. Main Workspace */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {currentView === 'spreadsheet' && (
          <div className="space-y-6">
            {/* Top KPI Metrics Strip */}
            <FleetStatsStrip
              records={records}
              settings={settings}
              onOpenRateModal={() => setIsRateModalOpen(true)}
            />

            {/* High-speed Voucher Entry Row with Auto Diesel/Petrol Calculation */}
            <QuickEntryBar
              onAddRecord={addRecord}
              knownVehicles={knownVehicles}
              suggestedNextCoupon={suggestedNextCoupon}
              settings={settings}
              onUpdateSettings={updateSettings}
              onOpenRateModal={() => setIsRateModalOpen(true)}
            />

            {/* Search & Filter Bar */}
            <FilterControls
              filter={filter}
              onFilterChange={(updates) => setFilter((prev) => ({ ...prev, ...updates }))}
              knownVehicles={knownVehicles}
              totalCount={records.length}
              filteredCount={filteredRecords.length}
            />

            {/* Fast Interactive Spreadsheet Grid */}
            <SpreadsheetTable
              records={filteredRecords}
              sortConfig={sortConfig}
              onSortChange={handleSortChange}
              onUpdateRecord={updateRecord}
              onDeleteRecord={deleteRecord}
              onDuplicateRecord={duplicateRecord}
              onDeleteMultiple={deleteMultiple}
              onExportSelected={(selected) =>
                exportRecordsToCsv(selected, `selected_fuel_vouchers_${getTodayDateString()}.csv`)
              }
              settings={settings}
            />
          </div>
        )}

        {/* Rapid Kiosk Voucher Entry View */}
        {currentView === 'rapid-entry' && (
          <RapidEntryView
            onAddRecord={addRecord}
            knownVehicles={knownVehicles}
            suggestedNextCoupon={suggestedNextCoupon}
            recentRecords={records}
            onDeleteRecord={deleteRecord}
            settings={settings}
            onSwitchToSpreadsheet={() => setCurrentView('spreadsheet')}
          />
        )}

        {/* 44 Fleet Vehicles Directory & History */}
        {currentView === 'fleet-summary' && (
          <FleetSummaryView
            records={records}
            settings={settings}
            onSelectVehicle={(veh) => {
              setFilter((prev) => ({ ...prev, vehicleFilter: veh }));
              setCurrentView('spreadsheet');
            }}
          />
        )}

        {/* Fuel Consumption & Cost Analytics */}
        {currentView === 'analytics' && (
          <AnalyticsView records={records} settings={settings} />
        )}
      </main>

      {/* Footer bar */}
      <footer className="border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 py-3 text-xs text-neutral-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-neutral-700 dark:text-neutral-300">Vehicle Section</span>
            <span>·</span>
            <span>44 Fleet Units Active</span>
            <span>·</span>
            <span>{records.length} Vouchers Recorded</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="hover:text-amber-600 dark:hover:text-amber-400 font-medium"
            >
              Rates &amp; Settings
            </button>
            <button
              onClick={() => exportRecordsToCsv(records, `fuel_voucher_ledger_${getTodayDateString()}.csv`)}
              className="hover:text-emerald-600 dark:hover:text-emerald-400 font-medium"
            >
              Export CSV
            </button>
          </div>
        </div>
      </footer>

      {/* Modals */}
      <CsvImportModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        onImport={(imported) => {
          importRecords(imported);
          setCurrentView('spreadsheet');
        }}
      />

      <PrintManifestModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        records={filteredRecords}
        settings={settings}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onSaveSettings={updateSettings}
        onClearAllRecords={clearAll}
        onResetDemoData={resetToDemo}
      />

      <RateSettingsModal
        isOpen={isRateModalOpen}
        onClose={() => setIsRateModalOpen(false)}
        settings={settings}
        recordsCount={records.length}
        onUpdateRates={updateRates}
      />
    </div>
  );
}
