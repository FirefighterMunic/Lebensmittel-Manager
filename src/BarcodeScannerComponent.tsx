import React, { useEffect } from 'react';
import { Html5QrcodeScanner } from 'html5-qrcode';

interface BarcodeScannerComponentProps {
    onScanSuccess: (decodedText: string, decodedResult: any) => void;
    onScanFailure?: (error: string) => void;
}

const BarcodeScannerComponent: React.FC<BarcodeScannerComponentProps> = ({ onScanSuccess, onScanFailure }) => {
    useEffect(() => {
        // Konfiguriert den neuen, leistungsfähigeren Scanner
        const scanner = new Html5QrcodeScanner(
            'reader', // ID des HTML-Elements für den Scanner
            {
                fps: 30, // Bilder pro Sekunde
                qrbox: { width: 250, height: 150 }, // Ein rechteckiger Sucher ist besser für Barcodes
                rememberLastUsedCamera: true,
                // Wählt automatisch die Rückkamera und verbessert den Fokus
                videoConstraints: {
                    facingMode: 'environment'
                }
            },
            /* verbose= */ false
        );

        scanner.render(onScanSuccess, onScanFailure);

        // Wichtige Aufräumfunktion: Stoppt die Kamera, wenn die Komponente geschlossen wird.
        return () => {
            // Stoppt den Scanner nur, wenn er noch läuft. Verhindert Fehler im React StrictMode.
            scanner.clear().catch(() => { /* Fehler ignorieren, wenn Scanner schon aus ist */ });
        };
    }, [onScanSuccess, onScanFailure]);

    return <div id="reader" />;
};

export default BarcodeScannerComponent;