# Stabilizacja przed v0.2 — 2026-10-13

## Środowisko i stan początkowy

- Backend Python/FastAPI w `engine`, logika pomocnicza w `functions`, PostgreSQL w `database`, frontend w `gui`, adapter net48 w `openness_adapter`.
- Domyślne `python -m pytest -q` zatrzymało się na braku `psycopg`. Domyślny interpreter pochodził z WindowsApps; istniejące `.venv` zawiera komplet zależności i Python 3.14.6.
- `pip check` w `.venv`: brak niespełnionych zależności. Niczego nie instalowano.
- Przed pracą istniały niezacommitowane zmiany w siedmiu plikach `openness_adapter/bin/Debug/net48` i `openness_adapter/obj/Debug/net48`. Kompilację kontrolną skierowano do `.local/v02-validation`.
- Pierwszy pełny przebieg w `.venv`: 218 zaliczonych, 1 niezaliczony.

## Poprawki

1. Test odkrywania modeli i tłumaczenia zakładał, że rozpoznany polski tekst trafi do Ollamy. Obecna ochrona celowo zachowuje taki tekst bez tłumaczenia. Test używa teraz dwóch angielskich źródeł oraz polskiego źródła i sprawdza dokładną zawartość żądania oraz wszystkie wyniki. Ochrona tekstów pozostała aktywna.
2. Klient Ollamy rozpoznaje timeout również wewnątrz `URLError.reason`: zwraca 504 zamiast błędnego 503. Dodane testy obejmują bezpośredni i opakowany timeout; opakowany wariant przed poprawką nie przechodził.
3. Fixture PostgreSQL tworzy unikalny schemat na test i ustawia go jako jedyny `search_path` dla połączeń testu, również żądań FastAPI. Sprzątanie usuwa tylko ten schemat. Zastępuje to bezwarunkowe `DELETE FROM process_samples` w bazie aplikacji. Test tworzenia tabeli korzysta teraz z fixture i sprawdza schemat oraz tożsamość tabeli, zamiast polegać na istniejącej tabeli publicznej.

Uwaga: pierwszy pełny przebieg wykonał jeszcze pierwotny fixture z `DELETE`. Nie sprawdzano zawartości tabeli przed tym przebiegiem, więc nie można ustalić, czy usunął wcześniejsze dane.

## Weryfikacja

```powershell
.\.venv\Scripts\python.exe -m pytest -q
# 221 passed in 13.15s

.\.venv\Scripts\python.exe -m pip check
# No broken requirements found.

dotnet build openness_adapter/TiaOpennessAdapter.csproj --no-restore --nologo --verbosity minimal -p:IntermediateOutputPath=../.local/v02-validation/obj/ -p:OutputPath=../.local/v02-validation/bin/
# 0 błędów, 0 ostrzeżeń

git diff --check
# bez błędów
```

Testy bazy wymagają lokalnego PostgreSQL skonfigurowanego przez `DB_NAME`, `DB_USER`, `DB_PASSWORD`, `DB_HOST` oraz prawa tworzenia schematów w tej bazie. Nie są zastępowane mockami ani automatycznie pomijane. Test połączenia nadal oczekuje istniejących lokalnych nazw bazy i użytkownika.

## Granice weryfikacji

Nie wykonywano zapisu do żywego projektu TIA, rzeczywistych tłumaczeń Ollamy ani ręcznego testu interfejsu w przeglądarce. Odczytowe wywołania TestClient do `/api/v1/tia/processes` i `/api/v1/tia/hmis/translation-models` zwróciły 200; drugie pobrało listę modeli z lokalnego serwera Ollama. Nie uruchamiano serwera ani modelu do tłumaczeń. Sukces kompilacji i testów nie potwierdza tych integracji. Nie zmieniano architektury ani funkcjonalności, nie tworzono commita ani wydania. Weryfikacja obejmuje pełny zakres zlecenia.


## Kontrola regresji HMI i zgodności API

- `test_hmi_review.py` sprawdza przygotowanie bez importu, zatwierdzony import wybranego HMI, odmowę dla zmienionych danych oraz weryfikację po świeżym eksporcie.
- `test_hmi_batches.py` obejmuje checkpoint, pauzę/wznowienie, błędny i niepewny import, `Skipped translations`, ręczną korektę i potwierdzenie, auto-repair oraz zachowanie rzeczywistych i literalnych podziałów wierszy.
- `test_hmi_ollama_auto_repair.py` sprawdza dodatkową próbę i odrzucenie nieskutecznej korekty. Kod wywołuje funkcję naprawy najwyżej raz dla odrzuconej propozycji.
- `test_hmi_text_safety.py` i `test_hmi_semantic_qa.py` obejmują identyfikatory, placeholdery, nawiasy, polski tekst w `en-US*` oraz znane błędy terminologiczne (`linkę`/`linię`, `Hydrauliczna`/`cykliski`).
- `test_hmi_text_lists.py` sprawdza import wpisów `Text lists` wybranego HMI i wykluczenie `Graphic lists`. `test_hmi_quality_report.py` sprawdza odczytowe raporty XLSX i niepełne dane starszych checkpointów.
- Statycznie zestawiono literały `/api/v1/*` w `gui/js` z trasami OpenAPI FastAPI: brak niepasujących ścieżek. Odczytowe żądania HTTP potwierdziły działanie routera TIA. Nie jest to test interakcji całego interfejsu w przeglądarce.

## Ocena gotowości v0.2

Kod przechodzi automatyczne testy i kompilację. Przed wydaniem wymagany jest pilotaż na kopii rzeczywistego projektu TIA V21: prepare, osobne zatwierdzenie importu, ponowny eksport i kontrola dokładnych wartości oraz `Text lists`/`Graphic lists`; następnie mały batch z checkpointem i wznowieniem. Sprawdzić z lokalnym modelem Ollama poprawność terminologii przemysłowej. Do tego czasu gotowość do wydania produkcyjnego jest warunkowa.
