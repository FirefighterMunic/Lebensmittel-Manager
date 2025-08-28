import React, {useEffect, useRef} from 'react';
import {Html5Qrcode, Html5QrcodeCameraScanConfig, Html5QrcodeSupportedFormats} from 'html5-qrcode';

// Hilfsfunktion zur Validierung von EAN-8 und EAN-13 Barcodes mittels Prüfsumme.
// Dies ist der entscheidende Schritt, um fehlerhafte Scans herauszufiltern.
function isValidEan(barcode: string): boolean {
    if (!/^\d+$/.test(barcode)) return false; // Darf nur aus Ziffern bestehen

    const len = barcode.length;
    if (len !== 8 && len !== 13) return false; // Muss EAN-8 oder EAN-13 sein

    const digits = barcode.split('').map(Number);
    const checkDigit = digits.pop()!; // Die letzte Ziffer ist die Prüfziffer

    let sum
    if (len === 13) {
        // EAN-13 Prüfsummen-Berechnung (Gewichtung 1, 3, 1, 3, ...)
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit * 1 : digit * 3), 0);
    } else { // len === 8
        // EAN-8 Prüfsummen-Berechnung (Gewichtung 3, 1, 3, 1, ...)
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit * 3 : digit * 1), 0);
    }

    const calculatedCheckDigit = (10 - (sum % 10)) % 10;

    return calculatedCheckDigit === checkDigit;
}

interface BarcodeScannerComponentProps {
    onScanSuccess: (decodedText: string, decodedResult: any) => void;
    onScanFailure?: (error: string) => void;
}

const BarcodeScannerComponentNew: React.FC<BarcodeScannerComponentProps> = (props) => {
    // Ein Ref, um die `props` zu speichern. Dies ermöglicht den Zugriff auf die neuesten
    // Callback-Funktionen im `useEffect`, ohne sie zur Abhängigkeitsliste hinzufügen zu müssen,
    // was Probleme im Strict Mode (doppeltes rendern) verhindert.
    const propsRef = useRef(props);
    useEffect(() => {
        propsRef.current = props;
    });

    useEffect(() => {
        // Dieser Effekt wird nur EINMAL beim Mounten der Komponente ausgeführt.
        const html5QrCode = new Html5Qrcode('reader-new', false);

        // Konfiguration für den Start des Scanners
        const scannerConfig: Html5QrcodeCameraScanConfig & { formatsToSupport?: any[], useBarCodeDetectorIfSupported?: boolean } = {
            fps: 10,
            // Die folgenden Optionen sind entscheidend für die Genauigkeit und Leistung
            useBarCodeDetectorIfSupported: true,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8
            ]
        };

        const onScanSuccessWrapper = (decodedText: string, decodedResult: any) => {
            // **ENTSCHEIDENDER SCHRITT: Validierung des gescannten Barcodes.**
            if (isValidEan(decodedText)) {
                console.log(`Gültiger EAN-Code erkannt: ${decodedText}`);
                // Ruft den eigentlichen Success-Handler der Elternkomponente auf.
                propsRef.current.onScanSuccess(decodedText, decodedResult);
            } else {
                // Optional: Ignorierte Scans für Debugging-Zwecke protokollieren.
                // Dies hilft zu sehen, was der Scanner "denkt", stört aber den Benutzer nicht.
                console.log(`Ignoriere ungültigen oder falsch gelesenen Barcode: ${decodedText}`);
            }
        };

        const onScanFailureWrapper = (error: string) => {
            // Wir können den häufigen Fehler "code not found" ignorieren, da er erwartet wird.
            if (error.toLowerCase().includes("not found")) {
                return;
            }
            propsRef.current.onScanFailure?.(error);
        };

        // Starte den Scanner mit der Rückkamera
        html5QrCode.start(
            {facingMode: "environment"},
            scannerConfig,
            onScanSuccessWrapper,
            onScanFailureWrapper
        ).catch(error => {
            console.error("Kamera konnte nicht gestartet werden.", error);
            propsRef.current.onScanFailure?.("Kamera konnte nicht gestartet werden. Bitte Berechtigungen prüfen.");
        });

        // Wichtige Aufräumfunktion: Stoppt die Kamera, wenn die Komponente geschlossen wird.
        return () => {
            if (html5QrCode.isScanning) {
                html5QrCode.stop()
                    .then(() => console.log("Kamera-Stream erfolgreich gestoppt."))
                    .catch(err => console.error("Fehler beim Stoppen des Scanners.", err));
            }
        };
    }, []); // Leeres Array stellt sicher, dass dieser Effekt nur einmal ausgeführt wird.

    return (
        <div className="relative w-full aspect-video bg-gray-800 rounded-xl overflow-hidden shadow-2xl">
            {/* Container für den Video-Stream. Die ID muss eindeutig sein. */}
            <div id="reader-new" className="w-full h-full"/>

            {/* Visuelles Overlay für das "Sichtfenster" */}
            <div className="absolute inset-0 pointer-events-none">
                {/* Semi-transparenter Rahmen mit einem "Loch" in der Mitte */}
                <div className="w-full h-full rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]"/>
                {/* Gestrichelter Rahmen zur Betonung des Scan-Bereichs */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
                                w-[90%] max-w-[400px] h-[150px] border-4 border-white/70 border-dashed rounded-2xl"/>
            </div>

            <p className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white text-sm bg-black/50 px-3 py-1 rounded-full">
                Barcode im Rahmen positionieren
            </p>
        </div>
    );
};

export default BarcodeScannerComponentNew;