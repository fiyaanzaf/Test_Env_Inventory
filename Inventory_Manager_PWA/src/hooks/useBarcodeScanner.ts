import { useState, useCallback, useEffect } from 'react';
import {
    BarcodeScanner,
    BarcodeFormat,
    LensFacing,
} from '@capacitor-mlkit/barcode-scanning';
import { Capacitor } from '@capacitor/core';

export interface ScanResult {
    hasContent: boolean;
    content: string;
    format: string;
}

export const useBarcodeScanner = () => {
    const [isSupported, setIsSupported] = useState(false);
    const [isScanning, setIsScanning] = useState(false);

    useEffect(() => {
        BarcodeScanner.isSupported().then((result) => {
            setIsSupported(result.supported);
        });
    }, []);

    const checkPermissions = async () => {
        const { camera } = await BarcodeScanner.checkPermissions();
        return camera;
    };

    const requestPermissions = async () => {
        const { camera } = await BarcodeScanner.requestPermissions();
        return camera;
    };

    const startScan = useCallback(async (): Promise<ScanResult | null> => {
        // Web fallback
        if (!Capacitor.isNativePlatform()) {
            console.warn('Barcode scanning is only supported on native devices');
            alert('Barcode scanning works only in the mobile app.');
            return null;
        }

        try {
            const granted = await requestPermissions();
            if (granted !== 'granted') {
                alert('Camera permission is required to scan barcodes');
                return null;
            }



            setIsScanning(true);

            const { barcodes } = await BarcodeScanner.scan({
                formats: [BarcodeFormat.QrCode, BarcodeFormat.Ean13, BarcodeFormat.UpcA],
            });

            setIsScanning(false);

            if (barcodes.length > 0) {
                const barcode = barcodes[0];
                return {
                    hasContent: true,
                    content: barcode.rawValue || '',
                    format: barcode.format,
                };
            }
            return null;

        } catch (error) {
            console.error('Scan failed', error);
            setIsScanning(false);
            return null;
        }
    }, []);

    const stopScan = useCallback(async () => {
        setIsScanning(false);
        // BarcodeScanner.scan() is a promise that resolves on scan or cancellation.
        // There is no programmatic "stop" for the standalone scanner once started, 
        // the user must close it via hardware back button or UI close button.
    }, []);

    return {
        isSupported,
        isScanning,
        startScan,
        stopScan,
        checkPermissions,
        requestPermissions,
    };
};
