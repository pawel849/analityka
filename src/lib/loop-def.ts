// Definicje pętli SOP – bez zależności od bazy (używane też w przeglądarce).

export const STEPS = [
  { key: "cel", title: "Cel", question: "Ile profitu chcemy osiągnąć i w jakim czasie?" },
  { key: "rzeczywistosc", title: "Rzeczywistość", question: "Ile profitu robimy naprawdę i w którą stronę idzie trend?" },
  { key: "luka", title: "Luka", question: "Co musi się zmienić, żeby dobić do celu? Co ma iść w górę, co w dół?" },
  { key: "lejek", title: "Lejek", question: "Na którym etapie lejka tracimy najwięcej pieniędzy?" },
  { key: "test", title: "Test", question: "Jaki test przyniesie najwięcej sprzedaży najmniejszym kosztem?" },
  { key: "kalendarz", title: "Kalendarz testu", question: "Kiedy test startuje, kiedy się kończy i po czym poznamy, że można go rozstrzygnąć?" },
  { key: "checklista", title: "Checklista", question: "Co dokładnie trzeba zrobić, żeby test wystartował?" },
  { key: "rozstrzygniecie", title: "Rozstrzygnięcie", question: "Który wariant wygrał?" },
  { key: "wnioski", title: "Wnioski", question: "Czego się nauczyliśmy i czy cel się ruszył?" },
] as const;
export type StepKey = (typeof STEPS)[number]["key"];

export const ELEMENTS = ["reklama", "strona", "VSL", "checkout", "oferta"] as const;
export const DECISIONS = ["wygrany", "nierozstrzygnięty", "przedłużyć"] as const;
export const MEASURE_TASK = "Sprawdzić, czy pomiar etapu działa";
export const LEVERS = [
  { key: "traffic", label: "Ruch (wejścia na stronę)", dir: "w górę" },
  { key: "conversion", label: "Konwersja", dir: "w górę" },
  { key: "aov", label: "Wartość zamówienia", dir: "w górę" },
  { key: "spend", label: "Koszt reklam", dir: "w dół" },
  { key: "costs", label: "Pozostałe koszty", dir: "w dół" },
] as const;

