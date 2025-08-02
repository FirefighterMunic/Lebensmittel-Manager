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
                fps: 10, // Bilder pro Sekunde
                qrbox: { width: 250, height: 150 }, // Ein rechteckiger Sucher ist besser für Barcodes
                rememberLastUsedCamera: true, // Merkt sich die zuletzt verwendete Kamera
            },
            /* verbose= */ false
        );

        scanner.render(onScanSuccess, onScanFailure);

        // Wichtige Aufräumfunktion: Stoppt die Kamera, wenn die Komponente geschlossen wird
        return () => {
            scanner.clear().catch(error => {
                console.error("Fehler beim Beenden des Scanners.", error);
            });
        };
    }, [onScanSuccess, onScanFailure]);

    return <div id="reader" />;
};

export default BarcodeScannerComponent;