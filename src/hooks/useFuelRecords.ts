import { useState, useEffect, useMemo, useCallback } from 'react';
import { FuelRecord, SheetSettings } from '../types/fuel';
import { INITIAL_FUEL_RECORDS, FLEET_VEHICLES } from '../data/initialRecords';
import {
  db,
  auth,
  googleProvider,
  handleFirestoreError,
  OperationType,
  testFirestoreConnection,
} from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  writeBatch,
} from 'firebase/firestore';
import { signInWithPopup, signOut, onAuthStateChanged, User } from 'firebase/auth';

const STORAGE_KEY_RECORDS = 'fuel_speedsheet_records_v4_clean';
const STORAGE_KEY_SETTINGS = 'fuel_speedsheet_settings_v4_clean';

const DEFAULT_SETTINGS: SheetSettings = {
  defaultUnit: 'L',
  currencySymbol: '₹',
  defaultRate: 94.5,
  dieselRate: 94.5,
  petrolRate: 103.5,
  autoIncrementCoupon: true,
  couponPrefix: 'CPN-',
};

export function useFuelRecords() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLiveConnected, setIsLiveConnected] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  // Fallback initial cache from localStorage
  const [records, setRecords] = useState<FuelRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_RECORDS);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }
    return INITIAL_FUEL_RECORDS;
  });

  const [settings, setSettings] = useState<SheetSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_SETTINGS);
      if (saved) {
        const loaded = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...loaded,
          dieselRate: loaded.dieselRate ?? loaded.defaultRate ?? DEFAULT_SETTINGS.dieselRate,
          petrolRate: loaded.petrolRate ?? DEFAULT_SETTINGS.petrolRate,
        };
      }
    } catch {
      // ignore
    }
    return DEFAULT_SETTINGS;
  });

  // Track auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  // Initial connection test
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // 1. Real-time Firestore Sync for Fuel Records (Shared live across all users)
  useEffect(() => {
    const q = query(collection(db, 'fuel_records'), orderBy('date', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const liveRecords: FuelRecord[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          liveRecords.push({
            id: docSnap.id,
            vehicleNumber: data.vehicleNumber,
            fuelAmount: Number(data.fuelAmount) || 0,
            fuelUnit: data.fuelUnit || 'L',
            couponNumber: data.couponNumber,
            date: data.date,
            fuelType: data.fuelType || 'Diesel',
            ratePerUnit: data.ratePerUnit ? Number(data.ratePerUnit) : undefined,
            totalCost: data.totalCost ? Number(data.totalCost) : undefined,
            status: data.status || 'reconciled',
            driverName: data.driverName || undefined,
            stationName: data.stationName || undefined,
            meterReading: data.meterReading || data.odometer ? Number(data.meterReading || data.odometer) : undefined,
            createdAt: data.createdAt || Date.now(),
          });
        });

        // Sort additionally by createdAt desc to preserve exact entry order
        liveRecords.sort((a, b) => {
          if (b.date !== a.date) {
            return b.date.localeCompare(a.date);
          }
          return (b.createdAt || 0) - (a.createdAt || 0);
        });

        setRecords(liveRecords);
        setIsLiveConnected(true);
        setSyncError(null);

        // Keep local cache fresh
        try {
          localStorage.setItem(STORAGE_KEY_RECORDS, JSON.stringify(liveRecords));
        } catch {
          // ignore
        }
      },
      (error) => {
        console.error('Firestore real-time subscription error:', error);
        setSyncError(error.message);
        handleFirestoreError(error, OperationType.GET, 'fuel_records');
      }
    );

    return () => unsubscribe();
  }, []);

  // 2. Real-time Firestore Sync for Settings & Live Rates
  useEffect(() => {
    const settingsDocRef = doc(db, 'settings', 'general');

    const unsubscribe = onSnapshot(
      settingsDocRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data() as Partial<SheetSettings>;
          setSettings((prev) => {
            const updated: SheetSettings = {
              ...prev,
              ...data,
              dieselRate: data.dieselRate ?? data.defaultRate ?? prev.dieselRate,
              petrolRate: data.petrolRate ?? prev.petrolRate,
            };
            try {
              localStorage.setItem(STORAGE_KEY_SETTINGS, JSON.stringify(updated));
            } catch {
              // ignore
            }
            return updated;
          });
        }
      },
      (error) => {
        console.warn('Firestore settings listener:', error);
        handleFirestoreError(error, OperationType.GET, 'settings/general');
      }
    );

    return () => unsubscribe();
  }, []);

  // Known vehicles list combines user's 44 fleet units and all logged records
  const knownVehicles = useMemo(() => {
    const set = new Set<string>(FLEET_VEHICLES);
    records.forEach((r) => {
      if (r.vehicleNumber?.trim()) {
        set.add(r.vehicleNumber.trim().toUpperCase());
      }
    });
    return Array.from(set);
  }, [records]);

  // Suggested next sequential coupon number
  const suggestedNextCoupon = useMemo(() => {
    if (!records.length) return `${settings.couponPrefix}10001`;

    let maxNum = 0;
    let foundPrefix = settings.couponPrefix;

    for (const r of records) {
      const match = r.couponNumber.match(/^([A-Za-z_-]*)(\d+)$/);
      if (match) {
        const prefix = match[1];
        const num = parseInt(match[2], 10);
        if (!isNaN(num) && num > maxNum) {
          maxNum = num;
          if (prefix) foundPrefix = prefix;
        }
      }
    }

    if (maxNum > 0) {
      const nextNum = maxNum + 1;
      const digits = String(nextNum).length;
      const padLength = Math.max(5, digits);
      return `${foundPrefix}${String(nextNum).padStart(padLength, '0')}`;
    }

    return `${settings.couponPrefix}10001`;
  }, [records, settings.couponPrefix]);

  // ADD RECORD (Persists to Firestore in real-time)
  const addRecord = useCallback(
    (data: Omit<FuelRecord, 'id' | 'createdAt'>): FuelRecord => {
      const cleanId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const now = Date.now();
      const cleanVehicle = data.vehicleNumber.trim().toUpperCase();
      const cleanCoupon = data.couponNumber.trim().toUpperCase();
      const calculatedTotal =
        data.totalCost ??
        (data.ratePerUnit ? Number((data.fuelAmount * data.ratePerUnit).toFixed(2)) : undefined);

      const newRecord: FuelRecord = {
        ...data,
        id: cleanId,
        createdAt: now,
        vehicleNumber: cleanVehicle,
        couponNumber: cleanCoupon,
        totalCost: calculatedTotal,
      };

      // Optimistic local update
      setRecords((prev) => [newRecord, ...prev]);

      // Background write to Cloud Firestore
      const docRef = doc(db, 'fuel_records', cleanId);
      setDoc(docRef, {
        id: cleanId,
        vehicleNumber: cleanVehicle,
        fuelAmount: Number(data.fuelAmount),
        fuelUnit: data.fuelUnit,
        couponNumber: cleanCoupon,
        date: data.date,
        fuelType: data.fuelType,
        ratePerUnit: Number(data.ratePerUnit),
        totalCost: Number(calculatedTotal),
        status: data.status || 'reconciled',
        createdAt: now,
        updatedAt: now,
      }).catch((err) => {
        handleFirestoreError(err, OperationType.CREATE, `fuel_records/${cleanId}`);
      });

      return newRecord;
    },
    []
  );

  // UPDATE RECORD (Syncs in real-time)
  const updateRecord = useCallback(
    async (id: string, updates: Partial<FuelRecord>) => {
      // Optimistic update
      setRecords((prev) =>
        prev.map((item) => {
          if (item.id === id) {
            const updated = { ...item, ...updates };
            if (updates.vehicleNumber) {
              updated.vehicleNumber = updates.vehicleNumber.trim().toUpperCase();
            }
            if (updates.couponNumber) {
              updated.couponNumber = updates.couponNumber.trim().toUpperCase();
            }
            if (updates.fuelAmount !== undefined || updates.ratePerUnit !== undefined) {
              const amount = updates.fuelAmount ?? item.fuelAmount;
              const rate = updates.ratePerUnit ?? item.ratePerUnit;
              if (rate && amount) {
                updated.totalCost = Number((amount * rate).toFixed(2));
              }
            }
            return updated;
          }
          return item;
        })
      );

      try {
        const docRef = doc(db, 'fuel_records', id);
        const cleanUpdates: Record<string, any> = { ...updates, updatedAt: Date.now() };
        if (updates.vehicleNumber) cleanUpdates.vehicleNumber = updates.vehicleNumber.trim().toUpperCase();
        if (updates.couponNumber) cleanUpdates.couponNumber = updates.couponNumber.trim().toUpperCase();
        if (updates.fuelAmount !== undefined) cleanUpdates.fuelAmount = Number(updates.fuelAmount);
        if (updates.ratePerUnit !== undefined) cleanUpdates.ratePerUnit = Number(updates.ratePerUnit);
        if (updates.totalCost !== undefined) cleanUpdates.totalCost = Number(updates.totalCost);

        await updateDoc(docRef, cleanUpdates);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `fuel_records/${id}`);
      }
    },
    []
  );

  // DELETE RECORD
  const deleteRecord = useCallback(async (id: string) => {
    setRecords((prev) => prev.filter((item) => item.id !== id));
    try {
      await deleteDoc(doc(db, 'fuel_records', id));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `fuel_records/${id}`);
    }
  }, []);

  // DELETE MULTIPLE
  const deleteMultiple = useCallback(async (ids: string[]) => {
    const idSet = new Set(ids);
    setRecords((prev) => prev.filter((item) => !idSet.has(item.id)));

    try {
      const batch = writeBatch(db);
      ids.forEach((id) => {
        batch.delete(doc(db, 'fuel_records', id));
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'fuel_records/batch');
    }
  }, []);

  // DUPLICATE RECORD
  const duplicateRecord = useCallback(
    async (id: string) => {
      const target = records.find((item) => item.id === id);
      if (!target) return;
      const cleanId = `rec_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const duplicated: FuelRecord = {
        ...target,
        id: cleanId,
        createdAt: Date.now(),
        couponNumber: `${target.couponNumber}-COPY`,
      };

      setRecords((prev) => [duplicated, ...prev]);

      try {
        await setDoc(doc(db, 'fuel_records', cleanId), {
          ...duplicated,
          updatedAt: Date.now(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `fuel_records/${cleanId}`);
      }
    },
    [records]
  );

  // IMPORT RECORDS
  const importRecords = useCallback(
    async (newRecords: Omit<FuelRecord, 'id' | 'createdAt'>[]) => {
      const now = Date.now();
      const formatted: FuelRecord[] = newRecords.map((r, i) => {
        const cleanId = `rec_${now}_${i}_${Math.random().toString(36).slice(2, 6)}`;
        return {
          ...r,
          id: cleanId,
          createdAt: now - i * 1000,
          vehicleNumber: r.vehicleNumber.trim().toUpperCase(),
          couponNumber: r.couponNumber.trim().toUpperCase(),
          totalCost:
            r.totalCost ??
            (r.ratePerUnit ? Number((r.fuelAmount * r.ratePerUnit).toFixed(2)) : undefined),
        };
      });

      setRecords((prev) => [...formatted, ...prev]);

      try {
        const batch = writeBatch(db);
        formatted.forEach((rec) => {
          batch.set(doc(db, 'fuel_records', rec.id), {
            id: rec.id,
            vehicleNumber: rec.vehicleNumber,
            fuelAmount: Number(rec.fuelAmount),
            fuelUnit: rec.fuelUnit,
            couponNumber: rec.couponNumber,
            date: rec.date,
            fuelType: rec.fuelType,
            ratePerUnit: Number(rec.ratePerUnit),
            totalCost: Number(rec.totalCost),
            status: rec.status || 'reconciled',
            createdAt: rec.createdAt,
            updatedAt: now,
          });
        });
        await batch.commit();
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'fuel_records/batch_import');
      }

      return formatted.length;
    },
    []
  );

  // RESET / CLEAR ALL RECORDS IN CLOUD
  const resetToDemo = useCallback(async () => {
    try {
      const batch = writeBatch(db);
      records.forEach((r) => batch.delete(doc(db, 'fuel_records', r.id)));
      await batch.commit();
    } catch {
      // ignore
    }
    setRecords([]);
  }, [records]);

  const clearAll = useCallback(async () => {
    try {
      const batch = writeBatch(db);
      records.forEach((r) => batch.delete(doc(db, 'fuel_records', r.id)));
      await batch.commit();
    } catch {
      // ignore
    }
    setRecords([]);
  }, [records]);

  // UPDATE SETTINGS (Live across all clients)
  const updateSettings = useCallback(
    async (newSettings: Partial<SheetSettings>, updateExistingRecords = true) => {
      const nextDiesel = newSettings.dieselRate ?? newSettings.defaultRate ?? settings.dieselRate ?? 94.5;
      const nextPetrol = newSettings.petrolRate ?? settings.petrolRate ?? 103.5;
      const nextUnit = newSettings.defaultUnit ?? settings.defaultUnit;

      const mergedSettings: SheetSettings = {
        ...settings,
        ...newSettings,
        dieselRate: nextDiesel,
        petrolRate: nextPetrol,
        defaultRate: nextDiesel,
        defaultUnit: nextUnit,
      };

      setSettings(mergedSettings);

      // Persist to Cloud Firestore so everyone sees the updated rates/settings immediately
      try {
        await setDoc(doc(db, 'settings', 'general'), {
          defaultUnit: mergedSettings.defaultUnit,
          currencySymbol: mergedSettings.currencySymbol,
          defaultRate: mergedSettings.defaultRate,
          dieselRate: mergedSettings.dieselRate,
          petrolRate: mergedSettings.petrolRate,
          autoIncrementCoupon: mergedSettings.autoIncrementCoupon,
          couponPrefix: mergedSettings.couponPrefix,
          updatedAt: Date.now(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/general');
      }

      // If requested, recalculate and update existing records in Cloud Firestore
      if (updateExistingRecords && records.length > 0) {
        try {
          const batch = writeBatch(db);
          records.forEach((item) => {
            const isPetrol = item.fuelType === 'Petrol' || item.fuelType === 'Gasoline';
            const effectiveRate = isPetrol ? nextPetrol : nextDiesel;
            const newTotalCost = Number((item.fuelAmount * effectiveRate).toFixed(2));

            batch.update(doc(db, 'fuel_records', item.id), {
              fuelUnit: nextUnit,
              ratePerUnit: effectiveRate,
              totalCost: newTotalCost,
              updatedAt: Date.now(),
            });
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'fuel_records/batch_recalculate');
        }
      }
    },
    [settings, records]
  );

  // UPDATE RATES (Live across all clients)
  const updateRates = useCallback(
    async (rates: { dieselRate?: number; petrolRate?: number }, updateExisting = true) => {
      const nextDiesel = rates.dieselRate !== undefined && !isNaN(rates.dieselRate) ? rates.dieselRate : (settings.dieselRate ?? 94.5);
      const nextPetrol = rates.petrolRate !== undefined && !isNaN(rates.petrolRate) ? rates.petrolRate : (settings.petrolRate ?? 103.5);

      const mergedSettings: SheetSettings = {
        ...settings,
        dieselRate: nextDiesel,
        petrolRate: nextPetrol,
        defaultRate: nextDiesel,
      };

      setSettings(mergedSettings);

      // Save to Cloud Firestore
      try {
        await setDoc(doc(db, 'settings', 'general'), {
          defaultUnit: mergedSettings.defaultUnit,
          currencySymbol: mergedSettings.currencySymbol,
          defaultRate: mergedSettings.defaultRate,
          dieselRate: mergedSettings.dieselRate,
          petrolRate: mergedSettings.petrolRate,
          autoIncrementCoupon: mergedSettings.autoIncrementCoupon,
          couponPrefix: mergedSettings.couponPrefix,
          updatedAt: Date.now(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.WRITE, 'settings/general');
      }

      if (updateExisting && records.length > 0) {
        try {
          const batch = writeBatch(db);
          records.forEach((item) => {
            const isPetrol = item.fuelType === 'Petrol' || item.fuelType === 'Gasoline';
            const effectiveRate = isPetrol ? nextPetrol : nextDiesel;
            const newTotalCost = Number((item.fuelAmount * effectiveRate).toFixed(2));

            batch.update(doc(db, 'fuel_records', item.id), {
              ratePerUnit: effectiveRate,
              totalCost: newTotalCost,
              updatedAt: Date.now(),
            });
          });
          await batch.commit();
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, 'fuel_records/batch_rates');
        }
      }
    },
    [settings, records]
  );

  const signInWithGoogle = useCallback(async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google sign in error:', error);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }, []);

  return {
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
    syncError,
    currentUser,
    signInWithGoogle,
    signOutUser,
  };
}
