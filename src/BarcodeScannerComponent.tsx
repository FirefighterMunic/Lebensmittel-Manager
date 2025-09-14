import React, {useEffect} from 'react';
import {Html5QrcodeScanner, Html5QrcodeScanType, Html5QrcodeSupportedFormats} from 'html5-qrcode';

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
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit : digit * 3), 0);
    } else { // len === 8
        // EAN-8 Prüfsummen-Berechnung (Gewichtung 3, 1, 3, 1, ...)
        sum = digits.reduce((acc, digit, index) => acc + (index % 2 === 0 ? digit * 3 : digit), 0);
    }

    const calculatedCheckDigit = (10 - (sum % 10)) % 10;

    return calculatedCheckDigit === checkDigit;
}

interface BarcodeScannerComponentProps {
    onScanSuccess: (decodedText: string, decodedResult: any) => void;
    onScanFailure?: (error: string) => void;
}

const BarcodeScannerComponent: React.FC<BarcodeScannerComponentProps> = (props) => {
    useEffect(() => {
        const scanner = new Html5QrcodeScanner('reader', {
            fps: 10,
            qrbox: {width: 250, height: 150},
            rememberLastUsedCamera: true,
            videoConstraints: {
                facingMode: 'environment'
            },
            formatsToSupport: [
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.EAN_8
            ],
            supportedScanTypes: [
                Html5QrcodeScanType.SCAN_TYPE_CAMERA
            ],
            useBarCodeDetectorIfSupported: true,
            showTorchButtonIfSupported: true,

        }, true /* verbose */);

        const onScanSuccessWrapper = (decodedText: string, decodedResult: any) => {
            // **ENTSCHEIDENDER SCHRITT: Validierung des gescannten Barcodes.**
            if (isValidEan(decodedText)) {
                console.log(`Gültiger EAN-Code erkannt: ${decodedText}`);
                // Ruft den eigentlichen Success-Handler der Elternkomponente auf.
                props.onScanSuccess(decodedText, decodedResult);
            } else {
                // Optional: Ignorierte Scans für Debugging-Zwecke protokollieren.
                // Dies hilft zu sehen, was der Scanner "denkt", stört aber den Benutzer nicht.
                console.log(`Ignoriere ungültigen oder falsch gelesenen Barcode: ${decodedText}`);
            }
        };

        const onScanFailureWrapper = (error: string) => {
            // Wir können den häufigen Fehler "code not found" ignorieren, da er erwartet wird.
            if (error.includes("not found")) {
                return;
            }
            props.onScanFailure?.(error);
        };

        scanner.render(onScanSuccessWrapper, onScanFailureWrapper);

        // Wichtige Aufräumfunktion: Stoppt die Kamera, wenn die Komponente geschlossen wird.
        return () => {
            scanner.clear().catch(error => {
                console.error("Fehler beim Bereinigen des Scanners:", error);
            });
        };
    }, [props.onScanSuccess, props.onScanFailure]); // Abhängigkeiten hinzugefügt, um stabile Funktionen zu nutzen

    // Wir fügen einen <style>-Block hinzu, um die von der Bibliothek generierten UI-Elemente anzupassen.
    // Dies gibt uns die Kontrolle über das Aussehen, ohne die Logik der Bibliothek zu verlieren.
    const customScannerStyles = `
        #reader {
            border: none !important; /* Überschreibt den Standard-Rahmen der Bibliothek */
            border-radius: 0.75rem; /* Passt zum äußeren Container (rounded-xl) */
            overflow: hidden; /* WICHTIG: Stellt sicher, dass das Video die runden Ecken nicht überlappt */
            position: relative; /* Notwendig für die absolute Positionierung der Steuerelemente *
        }

        #reader video {
            width: 100% !important;
            height: 100% !important;
            object-fit: cover !important; /* Stellt sicher, dass das Video den Container ausfüllt */
        }

        /* Style für alle Buttons (Start, Stop, Permissions) */
        #reader button {
            background-color: #2563eb; /* Tailwind blue-600 */
            color: white;
            font-weight: 600;
            padding: 0.5rem 1rem;
            border-radius: 0.5rem; /* rounded-lg */
            border: none;
            cursor: pointer;
            transition: background-color 0.2s;
            margin-top: 0.5rem;
        }
        #reader button:hover {
            background-color: #1d4ed8; /* Tailwind blue-700 */
        }

        /* Style für das Kamera-Auswahlmenü */
        #reader select {
            width: 100%;
            padding: 0.5rem;
            border: 1px solid #d1d5db; /* Tailwind gray-300 */
            border-radius: 0.5rem; /* rounded-lg */
            margin-bottom: 1rem;
        }

        /* Style für die Links (z.B. "Stop Scanning") */
        #reader a {
            color: #2563eb; /* Tailwind blue-600 */
        }

        /* Dieser Selektor zielt auf den Container der Blitzlicht/Kamera-Buttons. */
        /* Er ist etwas spezifisch, aber notwendig, um die von der Bibliothek generierten Stile zu überschreiben. */
        #reader > div[style*="position: absolute"] {
            /* Positioniert die Steuerelemente am unteren Rand zentriert */
            top: auto !important;
            bottom: 1rem !important;
            left: 50% !important;
            transform: translateX(-50%) !important;
            display: flex;
            gap: 1rem;
            width: auto !important; /* Überschreibt die von der Bibliothek gesetzte Breite */
        }

        /* Style für den Blitzlicht-Button und Kamera-Wechsel-Button */
        #reader__dashboard_section_torch, #reader__dashboard_section_swaplink {
            background-color: rgba(0, 0, 0, 0.5) !important;
            border-radius: 9999px !important; /* rounded-full */
            padding: 0.5rem !important;
            line-height: 0 !important;
            border: none !important;
            cursor: pointer !important;
            /* Setzt die Position zurück, damit sie sich im Flex-Container anordnen */
            position: static !important;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        #reader__dashboard_section_torch img, #reader__dashboard_section_swaplink img {
            filter: brightness(0) invert(1); /* Macht das Icon weiß */
            width: 24px;
            height: 24px;
        }

        /* Den "Powered by" Footer ausblenden */
        #reader__footer {
            display: none !important;
        }
    `;

    return (
        <div className="w-full">
            <style>{customScannerStyles}</style>
            {/* Dieser äußere Container sorgt für den grauen Rahmen und das Padding */}
            <div className="p-1 bg-gray-200 rounded-xl shadow-inner">
                {/* Die Bibliothek rendert ihre UI in dieses Div.
                    Die `aspect-video`-Klasse sorgt für das korrekte 16:9-Seitenverhältnis. */}
                <div id="reader"/>
            </div>
        </div>
    );
};

export default BarcodeScannerComponent;