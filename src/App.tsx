/// <reference types="vite/client" />

import React, {ChangeEvent, FormEvent, useEffect, useMemo, useState} from 'react';
import {initializeApp} from 'firebase/app';
import {getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut} from 'firebase/auth';
import {addDoc, collection, deleteDoc, doc, Firestore, getFirestore, onSnapshot, updateDoc} from 'firebase/firestore';
import {Camera, ChevronLeft, ChevronRight, LogOut, Pencil, Plus, Search, Trash2, X} from 'lucide-react';
import {addDays, format, isBefore} from 'date-fns';
import BarcodeScannerComponent from './BarcodeScannerComponent'; // Neue Komponente importieren

// Definiere eine Schnittstelle für die Lebensmittel-Objekte
interface Food {
    id: string;
    name: string;
    brands: string;
    expiryDate: string;
    storageDate: string;
    location: string;
    quantity: number;
    barcode: string;
    image: string;
}

// Typ für neue Lebensmittel, die noch keine ID haben
type NewFood = Omit<Food, 'id'>;

// Interface for Open Food Facts API response
interface OpenFoodFactsProduct {
    product_name?: string;
    brands?: string;
    quantity?: string | number;
    origins_old?: string;
    manufacturing_places?: string;
    nutriments?: {
        'energy-kcal_100g'?: number;
        fat_100g?: number;
        'saturated-fat_100g'?: number;
        carbohydrates_100g?: number;
        sugars_100g?: number;
        proteins_100g?: number;
        salt_100g?: number;
    };
    nutriscore_grade?: string;
    ecoscore_grade?: string;
    packaging?: string;
    image_url?: string;

    [key: string]: any;
}

type FoodDetails = Food & OpenFoodFactsProduct;


// Lade Konfiguration aus den Environment-Variablen (für Vite mit VITE_ Prefix)
const appId = import.meta.env.VITE_APP_ID || 'default-app-id';
const firebaseConfigString = import.meta.env.VITE_FIREBASE_CONFIG;
const firebaseConfig = firebaseConfigString ? JSON.parse(firebaseConfigString) : {};

// Die Haupt-App-Komponente
export default function App() {
    const [foods, setFoods] = useState<Food[]>([]);
    const [newFood, setNewFood] = useState<NewFood>({
        name: '',
        brands: '',
        expiryDate: '',
        storageDate: format(new Date(), 'yyyy-MM-dd'),
        location: '',
        quantity: 1,
        barcode: '',
        image: ''
    });
    const [editingId, setEditingId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [isAuthReady, setIsAuthReady] = useState(false);
    const [userId, setUserId] = useState<string | null>(null);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [foodToDelete, setFoodToDelete] = useState<Food | null>(null);
    const [showErrorModal, setShowErrorModal] = useState({visible: false, message: ''});
    const [searchTerm, setSearchTerm] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [authError, setAuthError] = useState<string | null>(null);
    const [showDetailsModal, setShowDetailsModal] = useState(false);
    const [foodForDetails, setFoodForDetails] = useState<FoodDetails | null>(null);
    const [currentImageIndex, setCurrentImageIndex] = useState(0);


    const [db, setDb] = useState<Firestore | null>(null); // Firestore instance
    const [isScannerOpen, setIsScannerOpen] = useState(false); // State for scanner visibility
    const [isFetchingBarcode, setIsFetchingBarcode] = useState(false); // Eigener Ladezustand für die Barcode-Suche

    const allImages = useMemo(() => {
        console.log(foodForDetails)
        if (!foodForDetails?.image_url) {
            return [];
        }
        try {
            const foodPics: string[] = []

            for (const key in foodForDetails) {
                if (key !== "image_url" && key.startsWith('image_') && key.endsWith('_url') && foodForDetails[key].split('.').at(-2) === '400') {
                    foodPics.push(foodForDetails[key])
                }
            }
            return foodPics
        } catch (e) {
            console.error("Fehler beim Erstellen der Bildergalerie-URLs:", e);
            // Fallback auf ein einzelnes Bild, falls die URL-Konstruktion fehlschlägt
            return foodForDetails.image_url ? [foodForDetails.image_url] : [];
        }
    }, [foodForDetails]);

    // Initialisiere Firebase und authentifiziere den Benutzer
    useEffect(() => {
        if (Object.keys(firebaseConfig).length === 0) {
            console.error('Firebase-Konfiguration ist nicht verfügbar.');
            setLoading(false);
            return;
        }

        const app = initializeApp(firebaseConfig);
        const firestore = getFirestore(app);
        const authService = getAuth(app);
        setDb(firestore);

        // Listener für den Authentifizierungsstatus
        const unsubscribeAuth = onAuthStateChanged(authService, (user) => {
            if (user) {
                setUserId(user.uid);
                setIsAuthReady(true);
                console.log('Benutzer authentifiziert. User ID:', user.uid);
            } else {
                setUserId(null);
                console.log('Kein Benutzer angemeldet.');
                setIsAuthReady(true);
            }
        });

        return () => unsubscribeAuth();
    }, []);

    // Echtzeit-Listener für die Lebensmittelliste
    useEffect(() => {
        // Wir warten, bis die Authentifizierung abgeschlossen ist UND ein Benutzer angemeldet ist.
        if (!isAuthReady || !userId || !db) {
            // Wenn kein Benutzer da ist (z.B. nach Logout), setzen wir die Liste zurück.
            if (isAuthReady && !userId) {
                setFoods([]);
                setLoading(false);
            }
            return;
        }

        setLoading(true); // Ladezustand vor dem Abruf aktivieren
        const foodCollectionPath = `artifacts/${appId}/foodItems`;
        const q = collection(db, foodCollectionPath);
        console.log('Listener für die Sammlung wird für User eingerichtet:', userId);

        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const items: Food[] = [];
            querySnapshot.forEach((doc) => {
                items.push({id: doc.id, ...doc.data()} as Food);
            });
            // Sortiere die Lebensmittel nach Ablaufdatum
            items.sort((a, b) => {
                const aHasDate = a.expiryDate && a.expiryDate !== '';
                const bHasDate = b.expiryDate && b.expiryDate !== '';

                if (aHasDate && !bHasDate) {
                    return -1; // a (mit Datum) kommt vor b (ohne Datum)
                }
                if (!aHasDate && bHasDate) {
                    return 1; // b (mit Datum) kommt vor a (ohne Datum)
                }
                if (!aHasDate && !bHasDate) {
                    return 0; // Beide haben kein Datum, Reihenfolge egal
                }
                // Beide haben ein Datum, sortiere chronologisch aufsteigend
                return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
            });
            setFoods(items);
            setLoading(false);
        }, (error) => {
            console.error('Fehler beim Abrufen der Lebensmittel:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [isAuthReady, db, userId]); // <-- WICHTIG: userId als Abhängigkeit hinzufügen

    // Handler für Formularänderungen
    const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
        const {name, value} = e.target;
        setNewFood(prev => ({...prev, [name]: name === 'quantity' ? (parseInt(value, 10) || 1) : value}));
    };

    // Handler für den Barcode-Abruf unter Verwendung der Open Food Facts API
    const handleFetchBarcodeData = async (barcodeToFetch?: string) => {
        // Verhindert die Ausführung, wenn bereits ein anderer Ladevorgang aktiv ist.
        if (loading || isFetchingBarcode) return;

        const barcode = barcodeToFetch || newFood.barcode;
        if (!barcode) {
            setShowErrorModal({visible: true, message: 'Bitte geben Sie einen Barcode ein.'});
            return;
        }

        setIsFetchingBarcode(true);
        let productData: NewFood | null = null;

        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
            if (!response.ok) {
                setShowErrorModal({visible: true, message: 'Netzwerkantwort war nicht ok.'});
                setIsFetchingBarcode(false);
                return;
            }
            const data = await response.json();

            if (data.status === 1) {
                const product = data["product"];
                productData = {
                    name: product.product_name || '',
                    brands: product.brands || '',
                    location: '',
                    barcode: barcode,
                    quantity: 1,
                    expiryDate: '',
                    storageDate: format(new Date(), 'yyyy-MM-dd'),
                    image: product.image_small_url || ''
                };
            } else {
                setShowErrorModal({visible: true, message: 'Produkt nicht gefunden. Bitte manuell eingeben.'});
            }
        } catch (error) {
            console.error('Fehler beim Abrufen der Produktdaten:', error);
            setShowErrorModal({
                visible: true,
                message: 'Fehler beim Abrufen der Produktdaten. Bitte versuchen Sie es erneut.'
            });
        }

        if (productData) {
            setNewFood(prev => ({...prev, ...productData}));
        }
        setIsFetchingBarcode(false);
    };

    // Neuer Handler für erfolgreiche Scans mit html5-qrcode
    const handleScanSuccess = (decodedText: string) => {
        if (decodedText && isScannerOpen) {
            setIsScannerOpen(false); // Schließt den Scanner sofort
            setNewFood(prev => ({...prev, barcode: decodedText}));
            // Ruft die Daten für den gescannten Code ab
            void handleFetchBarcodeData(decodedText);
        }
    };

    // Handler zum Hinzufügen/Aktualisieren eines Lebensmittels
    const handleAddOrUpdateFood = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!db) {
            console.error('Firestore ist nicht verfügbar.');
            return;
        }
        setLoading(true);
        const foodCollectionPath = `artifacts/${appId}/foodItems`;

        if (editingId) {
            // Eintrag aktualisieren
            try {
                const foodDocRef = doc(db, foodCollectionPath, editingId);
                await updateDoc(foodDocRef, {...newFood});
                setEditingId(null);
                setNewFood({
                    name: '',
                    brands: '',
                    expiryDate: '',
                    location: '',
                    quantity: 1,
                    barcode: '',
                    image: '',
                    storageDate: format(new Date(), 'yyyy-MM-dd')
                });
            } catch (e) {
                console.error('Fehler beim Aktualisieren des Eintrags:', e);
            }
        } else {
            // Neuen Eintrag hinzufügen oder Menge aktualisieren
            const existingFood = foods.find(
                f => f.name === newFood.name && f.brands === newFood.brands && f.expiryDate === newFood.expiryDate && f.location === newFood.location
            );

            try {
                if (existingFood) {
                    // Menge des bestehenden Eintrags aktualisieren
                    const foodDocRef = doc(db, foodCollectionPath, existingFood.id);
                    const newQuantity = existingFood.quantity + newFood.quantity;
                    await updateDoc(foodDocRef, {quantity: newQuantity});
                } else {
                    // Neuen Eintrag hinzufügen
                    await addDoc(collection(db, foodCollectionPath), {...newFood});
                }
                setNewFood({
                    name: '',
                    brands: '',
                    expiryDate: '',
                    location: '',
                    quantity: 1,
                    barcode: '',
                    image: '',
                    storageDate: format(new Date(), 'yyyy-MM-dd')
                });
            } catch (e) {
                console.error('Fehler beim Hinzufügen/Aktualisieren des Eintrags:', e);
            }
        }
        setLoading(false);
    };

    // Handler zum Bearbeiten eines Eintrags
    const handleEdit = (food: Food) => {
        setEditingId(food.id);
        setNewFood({
            name: food.name,
            brands: food.brands,
            expiryDate: food.expiryDate,
            storageDate: food.storageDate,
            location: food.location,
            quantity: food.quantity,
            barcode: food.barcode || '',
            image: food.image || ''
        });
    };

    // Handler zum Löschen eines Eintrags (bestätigen)
    const handleDeleteConfirm = (food: Food) => {
        setFoodToDelete(food);
        setShowDeleteModal(true);
    };

    // Handler zum Ausführen des Löschvorgangs
    const handleDelete = async () => {
        if (!db || !foodToDelete) {
            console.error('Firestore oder zu löschender Eintrag ist nicht verfügbar.');
            return;
        }
        setLoading(true);
        const foodCollectionPath = `artifacts/${appId}/foodItems`;
        try {
            const foodDocRef = doc(db, foodCollectionPath, foodToDelete.id);
            await deleteDoc(foodDocRef);
        } catch (e) {
            console.error('Fehler beim Löschen des Eintrags:', e);
        }
        setShowDeleteModal(false);
        setFoodToDelete(null);
        setLoading(false);
    };

    const handleShowDetails = async (food: Food) => {
        setFoodForDetails(food); // Set basic food info first
        setShowDetailsModal(true);
        setCurrentImageIndex(0); // Reset image index
        console.log(allImages)
        if (!food.barcode) {
            // We can show the modal with basic info even if there is no barcode
            return;
        }

        setIsFetchingBarcode(true);
        try {
            const response = await fetch(`https://world.openfoodfacts.org/api/v2/product/${food.barcode}`);
            if (!response.ok) {
                console.error('Netzwerkantwort war nicht ok.');
                setIsFetchingBarcode(false);
                return;
            }
            const data = await response.json();
            if (data.status === 1) {
                // combine existing food data with fetched data
                setFoodForDetails(prevFood => {
                    if (!prevFood) return null;
                    return {...prevFood, ...data['product']};
                });
            } else {
                // Barcode was present but not found on OpenFoodFacts
                // The modal is already open with basic info, maybe show a small message inside the modal
            }
        } catch (error) {
            console.error('Fehler beim Abrufen der Produktdetails:', error);
            // Also here, modal is open, maybe show an error message inside it
        }
        setIsFetchingBarcode(false);
    };

    // Hilfsfunktion, um zu prüfen, ob ein Ablaufdatum in 3 Tagen erreicht ist
    const isExpiringSoon = (date: string) => {
        if (!date) return false;
        const expiryDate = new Date(date);
        const threeDaysFromNow = addDays(new Date(), 3); // addDays ist hier verständlicher
        return isBefore(expiryDate, threeDaysFromNow);
    };

    // Hilfsfunktion, um zu prüfen, ob ein Ablaufdatum in 7 Tagen erreicht ist
    const isExpiringInOneWeek = (date: string) => {
        if (!date) return false;
        const expiryDate = new Date(date);
        const sevenDaysFromNow = addDays(new Date(), 7); // addDays ist hier verständlicher
        return isBefore(expiryDate, sevenDaysFromNow);
    };

    // Handler für den Login
    const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setAuthError(null);
        setLoading(true);
        const authService = getAuth();
        try {
            await signInWithEmailAndPassword(authService, email, password);
            // onAuthStateChanged wird den Rest erledigen
        } catch (error) {
            console.error("Login fehlgeschlagen:", error);
            setAuthError("Login fehlgeschlagen. Bitte E-Mail und Passwort überprüfen.");
        }
        setLoading(false);
    };

    // Handler für den Logout
    const handleLogout = async () => {
        const authService = getAuth();
        try {
            await signOut(authService);
        } catch (error) {
            console.error("Logout fehlgeschlagen:", error);
        }
    };

    // Gefilterte Liste basierend auf dem Suchbegriff
    const filteredFoods = foods.filter(food =>
        (food.name && food.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (food.brands && food.brands.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (food.location && food.location.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (!isAuthReady) {
        return (
            <div className="min-h-screen bg-gray-100 flex items-center justify-center">
                <p className="text-xl text-gray-600">Lade Authentifizierung...</p>
            </div>
        );
    }

    if (!userId) {
        return (
            <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4">
                <div className="max-w-md w-full bg-white shadow-xl rounded-2xl p-8 space-y-6">
                    <h2 className="text-center text-3xl font-extrabold text-gray-900">Anmelden</h2>
                    <form className="space-y-6" onSubmit={handleLogin}>
                        <div>
                            <label htmlFor="email-address" className="sr-only">Email-Adresse</label>
                            <input id="email-address" name="email" type="email" autoComplete="email" required
                                   className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Email-Adresse" value={email} onChange={e => setEmail(e.target.value)}/>
                        </div>
                        <div>
                            <label htmlFor="password" className="sr-only">Passwort</label>
                            <input id="password" name="password" type="password" autoComplete="current-password"
                                   required
                                   className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                                   placeholder="Passwort" value={password} onChange={e => setPassword(e.target.value)}/>
                        </div>
                        {authError && <p className="text-sm text-red-600 text-center">{authError}</p>}
                        <div>
                            <button type="submit" disabled={loading}
                                    className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400">
                                {loading ? 'Melde an...' : 'Anmelden'}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        );
    }

    const DetailRow = ({label, value}: { label: string, value?: string | number | null }) => {
        if (!value) return null;
        return (
            <div className="py-2 sm:grid sm:grid-cols-3 sm:gap-4">
                <dt className="text-sm font-medium text-gray-500">{label}</dt>
                <dd className="mt-1 text-sm text-gray-900 sm:mt-0 sm:col-span-2">{value}</dd>
            </div>
        );
    };

    // const allImages = foodForDetails?.images ? Object.values(foodForDetails.images).map((img: any) => img.display_url || img.thumb_url).filter(Boolean) : [];

    return (
        <div className="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 antialiased">
            {/* Scanner Modal */}
            {isScannerOpen && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex flex-col items-center justify-center z-50">
                    <div className="bg-white p-4 rounded-lg shadow-xl w-full max-w-md relative">
                        <h3 className="text-lg font-bold text-center mb-4">Barcode scannen</h3>
                        <BarcodeScannerComponent onScanSuccess={handleScanSuccess}/>
                        <button
                            onClick={() => setIsScannerOpen(false)}
                            className="absolute top-2 right-2 p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition"
                            title="Scanner schließen"
                        >
                            <X className="h-5 w-5"/>
                        </button>
                    </div>
                </div>
            )}
            <div className="max-w-4xl w-full bg-white shadow-xl rounded-2xl p-8 space-y-8">
                <header className="text-center relative">
                    <h1 className="text-4xl font-extrabold text-gray-800">Lebensmittel-Manager</h1>
                    <button onClick={handleLogout}
                            className="absolute top-0 right-0 p-2 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded-full transition duration-200"
                            title="Abmelden">
                        <LogOut className="h-6 w-6"/>
                    </button>
                </header>

                {/* Formular zum Hinzufügen/Bearbeiten */}
                <form onSubmit={handleAddOrUpdateFood} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                        <div className="md:col-span-2">
                            <label htmlFor="barcode" className="text-sm font-medium text-gray-700">Barcode</label>
                            <div className="flex space-x-2 mt-1">
                                <input
                                    type="text"
                                    id="barcode"
                                    name="barcode"
                                    disabled={isFetchingBarcode}
                                    value={newFood.barcode}
                                    onChange={handleInputChange}
                                    enterKeyHint="search"
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                            // Verhindert, dass das Hauptformular abgeschickt wird
                                            e.preventDefault();
                                            // Ruft die Daten nur ab, wenn ein Barcode vorhanden ist
                                            if (newFood.barcode) {
                                                void handleFetchBarcodeData();
                                            }
                                        }
                                    }}
                                    placeholder="Barcode eingeben oder scannen"
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                                />
                                <button
                                    type="button"
                                    onClick={() => void handleFetchBarcodeData()}
                                    disabled={loading || isFetchingBarcode || !newFood.barcode}
                                    className="p-2 w-10 h-10 flex items-center justify-center bg-gray-200 text-gray-700 rounded-lg shadow-sm hover:bg-gray-300 transition duration-200 disabled:bg-gray-100 disabled:text-gray-400"
                                    title="Produktdaten abrufen"
                                >
                                    {isFetchingBarcode ? (
                                        <svg className="animate-spin h-5 w-5 text-gray-700"
                                             xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10"
                                                    stroke="currentColor" strokeWidth="4"></circle>
                                            <path className="opacity-75" fill="currentColor"
                                                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                        </svg>
                                    ) : <Search className="h-5 w-5"/>}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setIsScannerOpen(true)}
                                    disabled={loading || isFetchingBarcode}
                                    className="p-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400"
                                    title="Kamera-Scanner öffnen"
                                >
                                    <Camera className="h-5 w-5"/>
                                </button>
                            </div>
                        </div>

                        <div>
                            <label htmlFor="quantity" className="text-sm font-medium text-gray-700">Menge <span
                                className="text-red-500">*</span></label>
                            <input
                                type="number"
                                id="quantity"
                                name="quantity"
                                value={newFood.quantity}
                                onChange={handleInputChange}
                                min="1"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="brands" className="text-sm font-medium text-gray-700">Marke</label>
                            <input
                                type="text"
                                id="brands"
                                name="brands"
                                disabled={isFetchingBarcode}
                                value={newFood.brands}
                                onChange={handleInputChange}
                                placeholder="Markenname"
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="name" className="text-sm font-medium text-gray-700">Name <span
                                className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="name"
                                name="name"
                                disabled={isFetchingBarcode}
                                value={newFood.name}
                                onChange={handleInputChange}
                                placeholder="Name des Lebensmittels"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="expiryDate"
                                   className="text-sm font-medium text-gray-700">Ablaufdatum</label>
                            <input
                                type="date"
                                id="expiryDate"
                                name="expiryDate"
                                value={newFood.expiryDate}
                                onChange={handleInputChange}
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="storageDate"
                                   className="text-sm font-medium text-gray-700">Einlagerungsdatum <span
                                className="text-red-500">*</span></label>
                            <input
                                type="date"
                                id="storageDate"
                                name="storageDate"
                                value={newFood.storageDate}
                                onChange={handleInputChange}
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div>
                            <label htmlFor="location" className="text-sm font-medium text-gray-700">Lagerort <span
                                className="text-red-500">*</span></label>
                            <input
                                type="text"
                                id="location"
                                name="location"
                                value={newFood.location}
                                onChange={handleInputChange}
                                placeholder="Lagerort (z.B. Kühlschrank)"
                                required
                                className="w-full px-4 py-2 mt-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                            />
                        </div>

                        <div className="md:col-span-4">
                            <button
                                type="submit"
                                disabled={loading || !newFood.name || !newFood.location || !newFood.quantity}
                                className="w-full bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-700 transition duration-200 disabled:bg-gray-400 flex items-center justify-center space-x-2"
                            >
                                {loading ? 'Lädt...' : editingId ? 'Speichern' : 'Hinzufügen'}
                                {!loading && !editingId && <Plus className="inline-block h-5 w-5"/>}
                            </button>
                        </div>
                    </div>
                </form>

                {/* Suchleiste */}
                <div className="relative mt-8">
                    <input
                        type="text"
                        placeholder="Suchen nach Name, Marke oder Lagerort..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 transition duration-200"
                    />
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400"/>
                </div>

                {/* Lebensmittelliste */}
                <div className="mt-8">
                    <h2 className="text-2xl font-bold text-gray-700 mb-4">Ihre Lebensmittel</h2>
                    {loading && <p className="text-center text-gray-500">Lädt...</p>}
                    {!loading && filteredFoods.length === 0 &&
                        <p className="text-center text-gray-500">Keine Lebensmittel gefunden.</p>}
                    {!loading && filteredFoods.length > 0 && (
                        <div className="space-y-4">
                            {filteredFoods.map((food) => (
                                <div
                                    key={food.id}
                                    className={`flex items-center justify-between p-4 rounded-lg shadow-sm transition-all duration-200 
                    ${isExpiringSoon(food.expiryDate) ? 'bg-red-50 ring-2 ring-red-400' : (isExpiringInOneWeek(food.expiryDate) ? 'bg-yellow-50 ring-2 ring-yellow-400' : 'bg-gray-50 hover:bg-gray-100')}`}
                                >
                                    <div className="flex items-center space-x-4 flex-1">
                                        {food.image && (
                                            <img
                                                src={food.image}
                                                alt={`Bild von ${food.name}`}
                                                className="w-16 h-16 object-cover rounded-lg shadow-sm"
                                                onError={(e) => {
                                                    const target = e.target as HTMLImageElement;
                                                    target.onerror = null;
                                                    target.src = `https://placehold.co/64x64/E2E8F0/1A202C?text=Kein+Bild`;
                                                }}
                                            />
                                        )}
                                        <div>
                                            <p className="text-lg font-semibold text-gray-800">
                                                {food.brands ? `${food.brands} - ` : ''}{food.name}
                                            </p>
                                            <p className="text-sm text-gray-600">Ablaufdatum: {food.expiryDate ? format(new Date(food.expiryDate), 'dd.MM.yyyy') : 'Unbekannt'}</p>
                                            <p className="text-sm text-gray-600">Lagerort: {food.location}</p>
                                            <p className="text-sm text-gray-600">Menge: {food.quantity}</p>
                                        </div>
                                    </div>
                                    <div className="flex space-x-2">
                                        {food.barcode && (
                                            <button
                                                onClick={() => handleShowDetails(food)}
                                                className="p-2 bg-blue-500 text-white rounded-full shadow-md hover:bg-blue-600 transition duration-200"
                                                title="Details anzeigen"
                                            >
                                                <Search className="h-5 w-5"/>
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleEdit(food)}
                                            className="p-2 bg-yellow-400 text-white rounded-full shadow-md hover:bg-yellow-500 transition duration-200"
                                            title="Bearbeiten"
                                        >
                                            <Pencil className="h-5 w-5"/>
                                        </button>
                                        <button
                                            onClick={() => handleDeleteConfirm(food)}
                                            className="p-2 bg-red-500 text-white rounded-full shadow-md hover:bg-red-600 transition duration-200"
                                            title="Löschen"
                                        >
                                            <Trash2 className="h-5 w-5"/>
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Löschbestätigungsmodal */}
            {showDeleteModal && foodToDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4">
                        <h3 className="text-xl font-bold text-gray-800">Eintrag löschen</h3>
                        <p className="text-gray-600">
                            Möchten Sie den Eintrag für "<span
                            className="font-semibold">{foodToDelete.name}</span>" wirklich löschen?
                        </p>
                        <div className="flex justify-end space-x-4">
                            <button
                                onClick={() => setShowDeleteModal(false)}
                                className="px-4 py-2 text-gray-600 rounded-lg hover:bg-gray-200 transition duration-200"
                            >
                                Abbrechen
                            </button>
                            <button
                                onClick={handleDelete}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition duration-200"
                            >
                                Löschen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Details Modal */}
            {showDetailsModal && foodForDetails && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div
                        className="bg-white rounded-xl p-6 shadow-2xl max-w-4xl w-full space-y-4 overflow-y-auto max-h-[95vh]">
                        <div className="flex justify-between items-start">
                            <h3 className="text-2xl font-bold text-gray-800">{foodForDetails.product_name || foodForDetails.name}</h3>
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    setFoodForDetails(null);
                                }}
                                className="p-2 text-gray-400 hover:text-gray-600"
                                title="Schließen"
                            >
                                <X className="h-6 w-6"/>
                            </button>
                        </div>

                        {isFetchingBarcode &&
                            <p className="text-center text-gray-500 py-8">Lade erweiterte Informationen von Open Food
                                Facts...</p>}

                        {!isFetchingBarcode && !foodForDetails.product_name && foodForDetails.barcode && (
                            <p className="text-center text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                                Produkt mit Barcode <span className="font-mono">{foodForDetails.barcode}</span> nicht
                                auf Open Food Facts gefunden.
                            </p>
                        )}

                        {!isFetchingBarcode && foodForDetails.product_name && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Left Column: Images */}
                                <div className="space-y-4">
                                    <h4 className="text-lg font-bold text-gray-700 border-b pb-2">Bilder</h4>
                                    {allImages.length > 0 ? (
                                        <div className="relative">
                                            <img
                                                src={allImages[currentImageIndex]}
                                                alt={`Produktbild ${currentImageIndex + 1} von ${foodForDetails.product_name}`}
                                                className="w-full h-auto object-contain rounded-lg shadow-md bg-gray-100 min-h-[200px]"
                                            />
                                            {allImages.length > 1 && (
                                                <>
                                                    <button
                                                        onClick={() => setCurrentImageIndex(prev => (prev - 1 + allImages.length) % allImages.length)}
                                                        className="absolute left-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition"
                                                    >
                                                        <ChevronLeft/>
                                                    </button>
                                                    <button
                                                        onClick={() => setCurrentImageIndex(prev => (prev + 1) % allImages.length)}
                                                        className="absolute right-2 top-1/2 -translate-y-1/2 bg-black bg-opacity-50 text-white p-2 rounded-full hover:bg-opacity-75 transition"
                                                    >
                                                        <ChevronRight/>
                                                    </button>
                                                    <div
                                                        className="absolute bottom-2 left-1/2 -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded-full">
                                                        {currentImageIndex + 1} / {allImages.length}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    ) : <p className="text-sm text-gray-500">Keine Bilder verfügbar.</p>}
                                </div>

                                {/* Right Column: Details */}
                                <div className="space-y-6">
                                    <div>
                                        <h4 className="text-lg font-bold text-gray-700 border-b pb-2 mb-2">Produktinformationen</h4>
                                        <dl className="divide-y divide-gray-200">
                                            <DetailRow label="Produkt Name" value={foodForDetails.product_name}/>
                                            <DetailRow label="Marken" value={foodForDetails.brands}/>
                                            <DetailRow label="Menge" value={foodForDetails.quantity}/>
                                            <DetailRow label="Herkunft" value={foodForDetails.origins_old}/>
                                            <DetailRow label="Herstellungsort"
                                                       value={foodForDetails.manufacturing_places}/>
                                        </dl>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-gray-700 border-b pb-2 mb-2">Nährwertinformationen</h4>
                                        <dl className="divide-y divide-gray-200">
                                            <DetailRow label="Energie (pro 100g)"
                                                       value={`${foodForDetails.nutriments?.['energy-kcal_100g']} kcal`}/>
                                            <DetailRow label="Fett (pro 100g)"
                                                       value={`${foodForDetails.nutriments?.fat_100g} g`}/>
                                            <DetailRow label="davon gesättigte Fettsäuren"
                                                       value={`${foodForDetails.nutriments?.['saturated-fat_100g']} g`}/>
                                            <DetailRow label="Kohlenhydrate (pro 100g)"
                                                       value={`${foodForDetails.nutriments?.carbohydrates_100g} g`}/>
                                            <DetailRow label="davon Zucker"
                                                       value={`${foodForDetails.nutriments?.sugars_100g} g`}/>
                                            <DetailRow label="Eiweiß (pro 100g)"
                                                       value={`${foodForDetails.nutriments?.proteins_100g} g`}/>
                                            <DetailRow label="Salz (pro 100g)"
                                                       value={`${foodForDetails.nutriments?.salt_100g} g`}/>
                                        </dl>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-gray-700 border-b pb-2 mb-2">Scores</h4>
                                        <dl className="divide-y divide-gray-200">
                                            <DetailRow label="Nutri-Score"
                                                       value={foodForDetails.nutriscore_grade?.toUpperCase()}/>
                                            <DetailRow label="Eco-Score"
                                                       value={foodForDetails.ecoscore_grade?.toUpperCase()}/>
                                        </dl>
                                    </div>

                                    <div>
                                        <h4 className="text-lg font-bold text-gray-700 border-b pb-2 mb-2">Verpackung</h4>
                                        <DetailRow label="Verpackung" value={foodForDetails.packaging}/>
                                    </div>
                                </div>
                            </div>
                        )}

                        {!foodForDetails.barcode && (
                            <p className="text-sm text-center text-gray-500 mt-4 p-3 bg-gray-50 rounded-lg">
                                Für dieses Produkt ist kein Barcode gespeichert, daher können keine zusätzlichen
                                Informationen von Open Food Facts geladen werden.
                            </p>
                        )}

                        <div className="flex justify-end pt-4 border-t mt-6">
                            <button
                                onClick={() => {
                                    setShowDetailsModal(false);
                                    setFoodForDetails(null);
                                }}
                                className="px-6 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 transition duration-200"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Fehlermodal für Barcode */}
            {showErrorModal.visible && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
                    <div className="bg-white rounded-xl p-6 shadow-2xl max-w-sm w-full space-y-4">
                        <h3 className="text-xl font-bold text-red-600">Fehler</h3>
                        <p className="text-gray-600">{showErrorModal.message}</p>
                        <div className="flex justify-end">
                            <button
                                onClick={() => setShowErrorModal({visible: false, message: ''})}
                                className="px-4 py-2 text-white bg-red-500 rounded-lg hover:bg-red-600 transition duration-200"
                            >
                                Schließen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
