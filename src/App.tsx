import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Archive, ArrowLeft, BarChart3, CalendarDays, ChevronLeft, ChevronRight, Database, Download, Home, Package, Pencil, Plus, Search, Settings2, Trash2, Upload, X } from "lucide-react";
import { liveQuery } from "dexie";
import { db, ensureDatabase, makeId, normalizeName } from "./db";
import type { Availability, ConsumptionPeriod, Group, Product, RotationRule } from "./types";
import { SCHEMA_VERSION, SYSTEM_GROUP_ID } from "./types";
import { daysBetween, formatDate, formatPeriod, getAvailability, getAvailableDate, isEarlyRepeat, latestPeriod, monthBounds, pluralDays, ruleLabel, shiftMonth, sortPeriodsDesc, todayLocal, validatePeriod } from "./lib/date";
import { diversityForMonth, earlyRepeatsForMonth, newProductsForMonth } from "./lib/stats";
import { type BackupFile, validateBackup } from "./lib/backup";

const APP_NAME = "Ротация";
type Tab = "home" | "calendar" | "products" | "stats";
type Sheet = { type: "product"; product?: Product } | { type: "period"; product: Product; period?: ConsumptionPeriod } | { type: "detail"; product: Product } | { type: "groups" } | { type: "data" } | null;

type Snapshot = { groups: Group[]; products: Product[]; periods: ConsumptionPeriod[] };

function useSnapshot() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ groups: [], products: [], periods: [] });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let subscription: { unsubscribe(): void } | undefined;
    ensureDatabase()
      .then(() => {
        subscription = liveQuery(async () => ({
          groups: await db.groups.orderBy("sortOrder").toArray(),
          products: await db.products.toArray(),
          periods: await db.periods.toArray()
        })).subscribe({ next: (value) => { setSnapshot(value); setReady(true); }, error: () => setError("Не удалось открыть локальное хранилище. Данные не были сохранены.") });
      })
      .catch(() => setError("IndexedDB недоступна. Проверьте настройки браузера и перезагрузите страницу."));
    return () => subscription?.unsubscribe();
  }, []);
  return { ...snapshot, ready, error };
}

export default function App() {
  const { groups, products, periods, ready, error } = useSnapshot();
  const [tab, setTab] = useState<Tab>("home");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [toast, setToast] = useState("");
  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 3500); };

  if (error) return <main className="fatal"><div className="empty-card"><h1>Не удалось открыть {APP_NAME.toLowerCase()}</h1><p>{error}</p><button className="primary" onClick={() => location.reload()}>Попробовать снова</button></div></main>;
  if (!ready) return <main className="loading" aria-label="Загрузка"><div className="skeleton" /><div className="skeleton tall" /></main>;

  return (
    <div className="app-shell">
      <main className="screen">
        {tab === "home" && <HomeScreen groups={groups} products={products} periods={periods} onAdd={() => setSheet({ type: "product" })} onPeriod={(product) => setSheet({ type: "period", product })} onOpen={(product) => setSheet({ type: "detail", product })} />}
        {tab === "calendar" && <CalendarScreen products={products} periods={periods} groups={groups} onOpen={(product) => setSheet({ type: "detail", product })} />}
        {tab === "products" && <ProductsScreen groups={groups} products={products} periods={periods} onAdd={() => setSheet({ type: "product" })} onOpen={(product) => setSheet({ type: "detail", product })} onGroups={() => setSheet({ type: "groups" })} onData={() => setSheet({ type: "data" })} />}
        {tab === "stats" && <StatsScreen products={products} periods={periods} />}
      </main>
      <button className="fab" aria-label="Добавить продукт или период" onClick={() => setSheet({ type: "product" })}><Plus /></button>
      <Navigation tab={tab} setTab={setTab} />
      {sheet && <Sheet onClose={() => setSheet(null)}>
        {sheet.type === "product" && <ProductForm groups={groups} products={products} initial={sheet.product} onCancel={() => setSheet(null)} onExisting={async (product) => { const restored = product.isArchived ? { ...product, isArchived: false, updatedAt: new Date().toISOString() } : product; if (product.isArchived) { await db.products.put(restored); showToast("Продукт восстановлен из архива."); } setSheet({ type: "period", product: restored }); }} onSaved={(message, product) => { showToast(message); setSheet({ type: "detail", product }); }} />}
        {sheet.type === "period" && <PeriodForm product={sheet.product} periods={periods.filter((p) => p.productId === sheet.product.id)} initial={sheet.period} onCancel={() => setSheet(null)} onEditPrevious={(period) => setSheet({ type: "period", product: sheet.product, period })} onSaved={(message) => { showToast(message); setSheet({ type: "detail", product: sheet.product }); }} />}
        {sheet.type === "detail" && <ProductDetail product={products.find((p) => p.id === sheet.product.id) ?? sheet.product} group={groups.find((g) => g.id === sheet.product.groupId)} periods={periods.filter((p) => p.productId === sheet.product.id)} onClose={() => setSheet(null)} onAddPeriod={() => setSheet({ type: "period", product: sheet.product })} onEditProduct={() => setSheet({ type: "product", product: sheet.product })} onEditPeriod={(period) => setSheet({ type: "period", product: sheet.product, period })} onChanged={showToast} />}
        {sheet.type === "groups" && <GroupsManager groups={groups} products={products} onClose={() => setSheet(null)} onChanged={showToast} />}
        {sheet.type === "data" && <DataManager groups={groups} products={products} periods={periods} onClose={() => setSheet(null)} onChanged={showToast} />}
      </Sheet>}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Header({ title, subtitle, action }: { title: string; subtitle: string; action?: ReactNode }) {
  return <header className="page-header"><div><h1>{title}</h1><p>{subtitle}</p></div>{action}</header>;
}

function Navigation({ tab, setTab }: { tab: Tab; setTab: (tab: Tab) => void }) {
  const items: Array<[Tab, string, ReactNode]> = [["home", "Можно снова", <Home />], ["calendar", "Календарь", <CalendarDays />], ["products", "Продукты", <Package />], ["stats", "Статистика", <BarChart3 />]];
  return <nav className="bottom-nav" aria-label="Основная навигация">{items.map(([id, label, icon]) => <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)} aria-current={tab === id ? "page" : undefined}><span className="nav-icon">{icon}</span><small className="nav-label">{label}</small></button>)}</nav>;
}

function productState(product: Product, periods: ConsumptionPeriod[], today = todayLocal()) {
  const last = latestPeriod(periods.filter((period) => period.productId === product.id));
  const availableDate = last ? getAvailableDate(last.endDate, product.rotationRule) : null;
  return { last, availableDate, availability: getAvailability(availableDate, today) };
}

function HomeScreen({ groups, products, periods, onAdd, onPeriod, onOpen }: { groups: Group[]; products: Product[]; periods: ConsumptionPeriod[]; onAdd(): void; onPeriod(product: Product): void; onOpen(product: Product): void }) {
  const today = todayLocal();
  const active = products.filter((product) => !product.isArchived).map((product) => ({ product, ...productState(product, periods, today) }));
  const sections: Array<{ key: Availability; title: string; items: typeof active }> = [
    { key: "now", title: "Можно сейчас", items: active.filter((x) => x.availability === "now").sort((a, b) => (!a.last ? -1 : !b.last ? 1 : (a.availableDate ?? "").localeCompare(b.availableDate ?? "") || a.product.name.localeCompare(b.product.name, "ru"))) },
    { key: "soon", title: "В ближайшие 7 дней", items: active.filter((x) => x.availability === "soon").sort((a, b) => a.availableDate!.localeCompare(b.availableDate!)) },
    { key: "later", title: "Позже", items: active.filter((x) => x.availability === "later").sort((a, b) => a.availableDate!.localeCompare(b.availableDate!)) }
  ];
  const dateTitle = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return <>
    <Header title="Можно снова" subtitle={dateTitle[0].toUpperCase() + dateTitle.slice(1)} action={<span className="round-icon"><Search /></span>} />
    {products.length === 0 ? <EmptyState onAdd={onAdd} /> : <>
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">Планирование недели</span>
          <h2>{sections[0].items.length
            ? "Пора выбрать продукты"
            : <><span className="hero-line">История всё</span><span className="hero-line">помнит</span></>}</h2>
          <p>{sections[0].items.length
            ? `${sections[0].items.length} ${productWord(sections[0].items.length)} можно рассмотреть сейчас`
            : <><span className="hero-line">Ближайшие даты</span><span className="hero-line">уже рассчитаны</span></>}</p>
        </div>
        <div className="hero-media" aria-hidden="true">
          <img className="hero-food" src={`${import.meta.env.BASE_URL}images/hero-fig.png`} alt="" />
        </div>
      </section>
      {sections.map((section) => section.items.length > 0 && <section className="section" key={section.key}><div className="section-title"><h2>{section.title}</h2><span className={`count ${section.key}`}>{section.items.length}</span></div>{groupedCards(section.items, groups, periods, onOpen, onPeriod)}</section>)}
    </>}
  </>;
}

function groupedCards(items: Array<{ product: Product; last?: ConsumptionPeriod; availableDate: string | null; availability: Availability }>, groups: Group[], periods: ConsumptionPeriod[], onOpen: (p: Product) => void, onPeriod: (p: Product) => void) {
  return groups.map((group) => {
    const groupItems = items.filter((item) => item.product.groupId === group.id);
    if (!groupItems.length) return null;
    return <div className="group-block" key={group.id}><h3><span className="group-dot" />{group.name}</h3>{groupItems.map(({ product, last, availableDate, availability }) => <ProductCard key={product.id} product={product} last={last} availableDate={availableDate} availability={availability} onOpen={() => onOpen(product)} onPeriod={() => onPeriod(product)} />)}</div>;
  });
}

function ProductCard({ product, last, availableDate, availability, onOpen, onPeriod }: { product: Product; last?: ConsumptionPeriod; availableDate: string | null; availability: Availability; onOpen(): void; onPeriod(): void }) {
  const today = todayLocal();
  const status = !last ? "Ещё не отмечался" : availability === "now" ? (availableDate === today ? "Можно с сегодня" : "Можно снова") : availability === "soon" ? `Через ${pluralDays(daysBetween(today, availableDate!))}` : `Можно с ${formatDate(availableDate!)}`;
  return <article className="product-card"><button className="card-main" onClick={onOpen}><strong>{product.name}</strong><span>{last ? `Последний период: ${formatPeriod(last)}` : "Истории пока нет"}</span><div className="badges"><em>{ruleLabel(product.rotationRule)}</em><em className={availability}>{status}</em></div></button><button className="quick-add" aria-label={`Добавить период: ${product.name}`} onClick={onPeriod}><Plus /></button></article>;
}

function EmptyState({ onAdd }: { onAdd(): void }) {
  return <section className="empty-card"><div className="empty-orbit" aria-hidden="true"><span /><span /><span /></div><h2>Начните со знакомых продуктов</h2><p>Здесь появятся продукты, частоту которых вы хотите отслеживать. Добавьте первый продукт и укажите, когда он был в рационе.</p><button className="primary" onClick={onAdd}>Добавить первый продукт</button></section>;
}

function CalendarScreen({ products, periods, groups, onOpen }: { products: Product[]; periods: ConsumptionPeriod[]; groups: Group[]; onOpen(p: Product): void }) {
  const today = todayLocal();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [selected, setSelected] = useState(today);
  const { start, end } = monthBounds(month);
  const first = new Date(`${start}T00:00:00`);
  const leading = (first.getDay() + 6) % 7;
  const days = Array.from({ length: leading + Number(end.slice(-2)) }, (_, index) => index < leading ? null : `${month}-${String(index - leading + 1).padStart(2, "0")}`);
  const selectedPeriods = periods.filter((period) => period.startDate <= selected && period.endDate >= selected);
  const title = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(first);
  const changeMonth = (delta: number) => { const next = shiftMonth(month, delta); setMonth(next); const firstWithData = periods.filter((p) => p.startDate <= monthBounds(next).end && p.endDate >= monthBounds(next).start).sort((a, b) => a.startDate.localeCompare(b.startDate))[0]; setSelected(firstWithData ? (firstWithData.startDate < monthBounds(next).start ? monthBounds(next).start : firstWithData.startDate) : monthBounds(next).start); };
  return <>
    <Header title="Календарь" subtitle="История продуктов по дням" action={<span className="round-icon"><CalendarDays /></span>} />
    <section className="calendar-card"><div className="month-row"><h2>{title[0].toUpperCase() + title.slice(1)}</h2><button className="soft" onClick={() => { setMonth(today.slice(0, 7)); setSelected(today); }}>Сегодня</button><button aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}><ChevronLeft /></button><button aria-label="Следующий месяц" onClick={() => changeMonth(1)}><ChevronRight /></button></div><div className="weekdays">{["Пн","Вт","Ср","Чт","Пт","Сб","Вс"].map((d) => <span key={d}>{d}</span>)}</div><div className="calendar-grid">{days.map((day, index) => day ? <button key={day} className={`${day === selected ? "selected" : ""} ${day === today ? "today" : ""}`} onClick={() => setSelected(day)}><span>{Number(day.slice(-2))}</span><i>{Math.min(3, periods.filter((p) => p.startDate <= day && p.endDate >= day).length) > 0 && Array.from({ length: Math.min(3, periods.filter((p) => p.startDate <= day && p.endDate >= day).length) }).map((_, i) => <b key={i} />)}</i></button> : <span key={`blank-${index}`} />)}</div></section>
    <section className="section"><div className="section-title"><h2>{formatDate(selected)}</h2><span className="count">{selectedPeriods.length}</span></div>{selectedPeriods.length ? selectedPeriods.map((period) => { const product = products.find((p) => p.id === period.productId); if (!product) return null; const group = groups.find((g) => g.id === product.groupId); return <button className="history-row" key={period.id} onClick={() => onOpen(product)}><span className="history-line" /><span><strong>{product.name}</strong><small>{formatPeriod(period)} · {group?.name}</small></span><ChevronRight /></button>; }) : <p className="quiet">В этот день записей нет.</p>}</section>
  </>;
}

function ProductsScreen({ groups, products, periods, onAdd, onOpen, onGroups, onData }: { groups: Group[]; products: Product[]; periods: ConsumptionPeriod[]; onAdd(): void; onOpen(p: Product): void; onGroups(): void; onData(): void }) {
  const [query, setQuery] = useState("");
  const [archived, setArchived] = useState(false);
  const filtered = products.filter((p) => p.isArchived === archived && p.name.toLocaleLowerCase("ru").includes(query.toLocaleLowerCase("ru")));
  return <>
    <Header title="Мои продукты" subtitle={`${products.filter((p) => !p.isArchived).length} активных ${productWord(products.filter((p) => !p.isArchived).length)}`} action={<button className="round-icon" onClick={onGroups} aria-label="Управление группами"><Settings2 /></button>} />
    <div className="search-box"><Search /><input aria-label="Найти продукт" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти продукт" /><button aria-label="Данные и резервная копия" onClick={onData}><Database /></button></div>
    <div className="chips"><button className={!archived ? "active" : ""} onClick={() => setArchived(false)}>Активные</button><button className={archived ? "active" : ""} onClick={() => setArchived(true)}>Архив</button><button onClick={onGroups}>Группы</button></div>
    {filtered.length === 0 ? <section className="empty-card compact"><h2>{query ? "Ничего не найдено" : archived ? "Архив пуст" : "Пока нет продуктов"}</h2><p>{query ? "Попробуйте изменить запрос." : archived ? "Архивированные продукты появятся здесь вместе с историей." : "Добавьте продукт, который хотите помнить."}</p>{!archived && !query && <button className="primary" onClick={onAdd}>Добавить продукт</button>}</section> : groups.map((group) => { const items = filtered.filter((p) => p.groupId === group.id).sort((a, b) => a.name.localeCompare(b.name, "ru")); return items.length ? <section className="section" key={group.id}><div className="section-title"><h2>{group.name}</h2><span className="count">{items.length}</span></div>{items.map((product) => { const state = productState(product, periods); return <button className="list-product" key={product.id} onClick={() => onOpen(product)}><span className="group-dot" /><span><strong>{product.name}</strong><small>{state.last ? `Последний период: ${formatPeriod(state.last)}` : "Ещё не отмечался"}</small><span className="badges"><em>{ruleLabel(product.rotationRule)}</em>{state.availableDate && <em className={state.availability}>{state.availability === "now" ? "Можно снова" : `Можно с ${formatDate(state.availableDate)}`}</em>}</span></span><ChevronRight /></button>; })}</section> : null; })}
  </>;
}

function StatsScreen({ products, periods }: { products: Product[]; periods: ConsumptionPeriod[] }) {
  const [month, setMonth] = useState(todayLocal().slice(0, 7));
  const prev = shiftMonth(month, -1);
  const diversity = diversityForMonth(periods, month);
  const previousDiversity = diversityForMonth(periods, prev);
  const newIds = newProductsForMonth(periods, month);
  const newNames = products.filter((p) => newIds.includes(p.id)).map((p) => p.name);
  const early = earlyRepeatsForMonth(products, periods, month);
  const old = products.filter((p) => !p.isArchived).map((p) => ({ product: p, last: latestPeriod(periods.filter((x) => x.productId === p.id)) })).filter((x) => x.last).sort((a, b) => a.last!.endDate.localeCompare(b.last!.endDate)).slice(0, 5);
  const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(new Date(`${month}-01T00:00:00`));
  const prevName = new Intl.DateTimeFormat("ru-RU", { month: "long" }).format(new Date(`${prev}-01T00:00:00`));
  const comparison = previousDiversity === 0 ? "Сравнение появится после данных за предыдущий месяц" : diversity > previousDiversity ? `Разнообразие увеличилось: ${diversity} против ${previousDiversity} в ${prevName}` : diversity < previousDiversity ? `Разнообразие уменьшилось: ${diversity} против ${previousDiversity} в ${prevName}` : `Разнообразие осталось на прежнем уровне: по ${diversity}`;
  return <>
    <Header title="Статистика" subtitle="Картина разнообразия" action={<span className="round-icon"><BarChart3 /></span>} />
    <div className="month-switch"><button aria-label="Предыдущий месяц" onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft /></button><strong>{monthName[0].toUpperCase() + monthName.slice(1)}</strong><button aria-label="Следующий месяц" disabled={month >= todayLocal().slice(0, 7)} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight /></button></div>
    <section className="stats-hero"><span>Разнообразие месяца</span><strong>{diversity}</strong><p>{diversity === 1 ? "1 отслеживаемый продукт" : `${diversity} разных отслеживаемых ${productWord(diversity)}`}</p></section>
    <div className="stats-grid"><article className="stat sky"><strong>{newNames.length}</strong><span>впервые отмечены</span></article><article className="stat amber"><strong>{new Set(early.map((x) => x.product.id)).size}</strong><span>ранних повторов</span></article></div>
    <article className="info-card"><h2>Сравнение месяцев</h2><p>{comparison}</p></article>
    <article className="info-card"><h2>Новые продукты</h2><p>{newNames.length ? newNames.join(", ") : "В этом месяце новых продуктов пока нет."}</p></article>
    {early.length > 0 && <article className="info-card"><h2>Повторы раньше интервала</h2>{early.map((item) => <p key={item.period.id}><strong>{item.product.name}</strong>: {formatDate(item.period.startDate)}, окно ожидалось с {formatDate(item.expectedDate)}</p>)}</article>}
    {old.length > 0 && <article className="info-card"><h2>Давно не было в рационе</h2>{old.map(({ product, last }) => <p key={product.id}><strong>{product.name}</strong> · {formatPeriod(last!)}</p>)}</article>}
  </>;
}

function Sheet({ children, onClose }: { children: ReactNode; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.focus(); const listener = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); }; document.addEventListener("keydown", listener); return () => { document.removeEventListener("keydown", listener); previous?.focus(); }; }, [onClose]);
  return <div className="sheet-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><div className="sheet" role="dialog" aria-modal="true" tabIndex={-1} ref={ref}><div className="sheet-handle" /><button className="sheet-close" aria-label="Закрыть" onClick={onClose}><X /></button>{children}</div></div>;
}

function FormHeader({ title, subtitle }: { title: string; subtitle?: string }) { return <div className="form-header"><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>; }

function ProductForm({ groups, products, initial, onCancel, onExisting, onSaved }: { groups: Group[]; products: Product[]; initial?: Product; onCancel(): void; onExisting(product: Product): void; onSaved(message: string, product: Product): void }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [groupId, setGroupId] = useState(initial?.groupId ?? SYSTEM_GROUP_ID);
  const [rule, setRule] = useState<RotationRule>(initial?.rotationRule ?? "monthly");
  const [newGroup, setNewGroup] = useState("");
  const [withPeriod, setWithPeriod] = useState(!initial);
  const [startDate, setStartDate] = useState(todayLocal());
  const [endDate, setEndDate] = useState(todayLocal());
  const [error, setError] = useState("");
  const matches = !initial && normalizeName(name).length > 0 ? products.filter((product) => product.name.toLocaleLowerCase("ru").includes(normalizeName(name).toLocaleLowerCase("ru"))).slice(0, 4) : [];
  const save = async (event: FormEvent) => {
    event.preventDefault(); setError("");
    const clean = normalizeName(name);
    if (!clean) return setError("Введите название продукта");
    const duplicate = products.find((p) => p.id !== initial?.id && normalizeName(p.name).toLocaleLowerCase("ru") === clean.toLocaleLowerCase("ru"));
    if (duplicate) return setError(`Продукт «${duplicate.name}» уже существует. Откройте его и добавьте новый период.`);
    if (withPeriod) { const periodError = validatePeriod(startDate, endDate); if (periodError) return setError(periodError); }
    const now = new Date().toISOString();
    let finalGroupId = groupId;
    let product!: Product;
    await db.transaction("rw", db.groups, db.products, db.periods, async () => {
      if (normalizeName(newGroup)) {
        const existingGroup = groups.find((g) => g.name.toLocaleLowerCase("ru") === normalizeName(newGroup).toLocaleLowerCase("ru"));
        if (existingGroup) finalGroupId = existingGroup.id;
        else { finalGroupId = makeId(); await db.groups.add({ id: finalGroupId, name: normalizeName(newGroup), sortOrder: Math.max(0, ...groups.map((g) => g.sortOrder)) + 1, createdAt: now, updatedAt: now }); }
      }
      product = { id: initial?.id ?? makeId(), name: clean, groupId: finalGroupId, rotationRule: rule, isArchived: initial?.isArchived ?? false, createdAt: initial?.createdAt ?? now, updatedAt: now };
      await db.products.put(product);
      if (withPeriod && !initial) await db.periods.add({ id: makeId(), productId: product.id, startDate, endDate, createdAt: now, updatedAt: now });
    });
    const available = withPeriod && !initial ? ` Можно снова с ${formatDate(getAvailableDate(endDate, rule))}.` : "";
    onSaved(`Продукт «${product.name}» ${initial ? "обновлён" : "добавлен"}.${available}`, product);
  };
  return <form onSubmit={save}><FormHeader title={initial ? "Изменить продукт" : "Новый продукт"} subtitle="Только то, что важно помнить" />
    <label>Название<input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, миндальное молоко" /></label>
    {matches.length > 0 && <div className="matches" aria-label="Совпадения среди продуктов"><p>Уже есть в базе</p>{matches.map((product) => <button type="button" key={product.id} onClick={() => onExisting(product)}><span><strong>{product.name}</strong><small>{product.isArchived ? "В архиве · восстановить и добавить период" : "Добавить новый период"}</small></span><ChevronRight /></button>)}</div>}
    <label>Группа<select value={groupId} onChange={(e) => setGroupId(e.target.value)}>{groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
    <label>Или новая группа<input value={newGroup} onChange={(e) => setNewGroup(e.target.value)} placeholder="Название новой группы" /></label>
    <fieldset><legend>Интервал</legend><div className="segmented">{(["weekly", "biweekly", "monthly"] as RotationRule[]).map((item) => <button type="button" key={item} className={rule === item ? "active" : ""} onClick={() => setRule(item)}>{ruleLabel(item)}</button>)}</div></fieldset>
    {!initial && <label className="check"><input type="checkbox" checked={withPeriod} onChange={(e) => setWithPeriod(e.target.checked)} /> Сразу добавить период употребления</label>}
    {withPeriod && !initial && <DateFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />}
    {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Отмена</button><button className="primary">Сохранить</button></div>
  </form>;
}

function DateFields({ startDate, endDate, onStart, onEnd }: { startDate: string; endDate: string; onStart(v: string): void; onEnd(v: string): void }) { return <div className="date-fields"><label>Дата начала<input type="date" max={todayLocal()} value={startDate} onChange={(e) => onStart(e.target.value)} /></label><label>Дата окончания<input type="date" max={todayLocal()} value={endDate} onChange={(e) => onEnd(e.target.value)} /></label></div>; }

function PeriodForm({ product, periods, initial, onCancel, onEditPrevious, onSaved }: { product: Product; periods: ConsumptionPeriod[]; initial?: ConsumptionPeriod; onCancel(): void; onEditPrevious(p: ConsumptionPeriod): void; onSaved(message: string): void }) {
  const [startDate, setStartDate] = useState(initial?.startDate ?? todayLocal());
  const [endDate, setEndDate] = useState(initial?.endDate ?? todayLocal());
  const [error, setError] = useState("");
  const [warning, setWarning] = useState<{ previous: ConsumptionPeriod; available: string } | null>(null);
  const persist = async () => { const now = new Date().toISOString(); const period = { id: initial?.id ?? makeId(), productId: product.id, startDate, endDate, createdAt: initial?.createdAt ?? now, updatedAt: now }; await db.periods.put(period); onSaved(`Период сохранён. Можно снова с ${formatDate(getAvailableDate(endDate, product.rotationRule))}.`); };
  const submit = async (event: FormEvent) => { event.preventDefault(); const validation = validatePeriod(startDate, endDate); if (validation) return setError(validation); const candidate: ConsumptionPeriod = { id: initial?.id ?? "candidate", productId: product.id, startDate, endDate, createdAt: initial?.createdAt ?? new Date().toISOString(), updatedAt: new Date().toISOString() }; if (!initial && isEarlyRepeat(periods, candidate, product.rotationRule)) { const previous = latestPeriod(periods.filter((p) => p.endDate < startDate))!; setWarning({ previous, available: getAvailableDate(previous.endDate, product.rotationRule) }); return; } await persist(); };
  return <form onSubmit={submit}><FormHeader title={initial ? "Изменить период" : product.name} subtitle={`${ruleLabel(product.rotationRule)} · ${periods.length ? `Последний период: ${formatPeriod(latestPeriod(periods)!)}` : "Истории пока нет"}`} /><DateFields startDate={startDate} endDate={endDate} onStart={setStartDate} onEnd={setEndDate} />{error && <p className="form-error">{error}</p>}<div className="form-actions"><button type="button" className="secondary" onClick={onCancel}>Отмена</button><button className="primary">Сохранить</button></div>{warning && <div className="warning-dialog" role="alertdialog" aria-modal="true"><h3>Этот продукт уже был недавно</h3><p>Предыдущий период закончился {formatDate(warning.previous.endDate)}. По выбранному интервалу следующее окно начинается {formatDate(warning.available)}.</p><button type="button" className="secondary" onClick={() => onEditPrevious(warning.previous)}>Изменить предыдущий период</button><button type="button" className="primary" onClick={persist}>Всё равно добавить</button><button type="button" className="text-button" onClick={() => setWarning(null)}>Отмена</button></div>}</form>;
}

function ProductDetail({ product, group, periods, onClose, onAddPeriod, onEditProduct, onEditPeriod, onChanged }: { product: Product; group?: Group; periods: ConsumptionPeriod[]; onClose(): void; onAddPeriod(): void; onEditProduct(): void; onEditPeriod(p: ConsumptionPeriod): void; onChanged(m: string): void }) {
  const state = productState(product, periods);
  const sorted = sortPeriodsDesc(periods);
  const toggleArchive = async () => { if (!product.isArchived && !confirm("Продукт исчезнет из активных списков, но его история сохранится. Переместить в архив?")) return; await db.products.update(product.id, { isArchived: !product.isArchived, updatedAt: new Date().toISOString() }); onChanged(product.isArchived ? "Продукт восстановлен." : "Продукт перемещён в архив. История сохранена."); onClose(); };
  const removePeriod = async (period: ConsumptionPeriod) => { if (!confirm(`Удалить период ${formatPeriod(period)}? История и следующая доступная дата будут пересчитаны.`)) return; await db.periods.delete(period.id); onChanged("Период удалён. Даты пересчитаны."); };
  return <div><button className="back-link" onClick={onClose}><ArrowLeft /> Назад</button><FormHeader title={product.name} subtitle={`${group?.name ?? "Без группы"} · ${ruleLabel(product.rotationRule)}`} /><div className="detail-status"><span>Текущий статус</span><strong>{!state.last ? "Ещё не отмечался" : state.availability === "now" ? "Можно снова" : `Можно с ${formatDate(state.availableDate!)}`}</strong>{state.last && <small>Последний период: {formatPeriod(state.last)}</small>}</div><div className="detail-actions"><button className="primary" onClick={onAddPeriod}><Plus /> Добавить период</button><button className="secondary" onClick={onEditProduct}><Pencil /> Изменить</button></div><h3 className="subheading">История</h3>{sorted.length ? sorted.map((period) => <div className="period-row" key={period.id}><span><strong>{formatPeriod(period)}</strong>{isEarlyRepeat(periods, period, product.rotationRule) && <em>Повтор раньше интервала</em>}</span><button aria-label="Изменить период" onClick={() => onEditPeriod(period)}><Pencil /></button><button className="danger-icon" aria-label="Удалить период" onClick={() => removePeriod(period)}><Trash2 /></button></div>) : <p className="quiet">Периоды ещё не добавлены.</p>}<button className="archive-button" onClick={toggleArchive}><Archive /> {product.isArchived ? "Восстановить из архива" : "Переместить в архив"}</button></div>;
}

function GroupsManager({ groups, products, onClose, onChanged }: { groups: Group[]; products: Product[]; onClose(): void; onChanged(m: string): void }) {
  const [name, setName] = useState("");
  const add = async (e: FormEvent) => { e.preventDefault(); const clean = normalizeName(name); if (!clean) return; if (groups.some((g) => g.name.toLocaleLowerCase("ru") === clean.toLocaleLowerCase("ru"))) return onChanged("Группа с таким названием уже есть."); const now = new Date().toISOString(); await db.groups.add({ id: makeId(), name: clean, sortOrder: Math.max(...groups.map((g) => g.sortOrder), 0) + 1, createdAt: now, updatedAt: now }); setName(""); onChanged("Группа добавлена."); };
  const rename = async (group: Group) => { const value = prompt("Новое название группы", group.name); if (!value || !normalizeName(value)) return; await db.groups.update(group.id, { name: normalizeName(value), updatedAt: new Date().toISOString() }); };
  const remove = async (group: Group) => { if (group.id === SYSTEM_GROUP_ID) return; if (!confirm(`Удалить группу «${group.name}»? Продукты будут перенесены в «Без группы», история сохранится.`)) return; await db.transaction("rw", db.groups, db.products, async () => { await db.products.where("groupId").equals(group.id).modify({ groupId: SYSTEM_GROUP_ID, updatedAt: new Date().toISOString() }); await db.groups.delete(group.id); }); onChanged("Группа удалена, продукты перенесены без потери истории."); };
  return <div><FormHeader title="Группы" subtitle="Только для удобства просмотра" /><form className="inline-form" onSubmit={add}><input aria-label="Новая группа" value={name} onChange={(e) => setName(e.target.value)} placeholder="Новая группа" /><button className="primary">Добавить</button></form>{groups.map((group) => <div className="manage-row" key={group.id}><span><strong>{group.name}</strong><small>{products.filter((p) => p.groupId === group.id).length} продуктов</small></span><button aria-label="Переименовать" onClick={() => rename(group)}><Pencil /></button>{group.id !== SYSTEM_GROUP_ID && <button className="danger-icon" aria-label="Удалить" onClick={() => remove(group)}><Trash2 /></button>}</div>)}<button className="secondary full" onClick={onClose}>Готово</button></div>;
}

function DataManager({ groups, products, periods, onClose, onChanged }: { groups: Group[]; products: Product[]; periods: ConsumptionPeriod[]; onClose(): void; onChanged(m: string): void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [candidate, setCandidate] = useState<BackupFile | null>(null);
  const [error, setError] = useState("");
  const exportData = async () => { const backup: BackupFile = { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), settings: (await db.settings.get("app"))!, groups, products, periods }; const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `rotation-backup-${todayLocal()}.json`; link.click(); URL.revokeObjectURL(url); onChanged("Резервная копия сохранена."); };
  const chooseFile = async (file?: File) => { setError(""); setCandidate(null); if (!file) return; try { setCandidate(validateBackup(JSON.parse(await file.text()))); } catch (err) { setError(err instanceof Error ? err.message : "Не удалось прочитать файл"); } };
  const restore = async () => { if (!candidate || !confirm("Восстановление заменит текущие данные содержимым резервной копии. Продолжить?")) return; await db.transaction("rw", db.groups, db.products, db.periods, db.settings, async () => { await Promise.all([db.periods.clear(), db.products.clear(), db.groups.clear(), db.settings.clear()]); await db.groups.bulkAdd(candidate.groups); await db.products.bulkAdd(candidate.products); await db.periods.bulkAdd(candidate.periods); await db.settings.add(candidate.settings); }); onChanged("Данные полностью восстановлены."); onClose(); };
  return <div><FormHeader title="Данные" subtitle="Резервная копия хранится только у вас" /><article className="data-card"><Download /><div><h3>Сохранить резервную копию</h3><p>{groups.length} групп, {products.length} продуктов и {periods.length} периодов.</p></div><button className="secondary" onClick={exportData}>Сохранить</button></article><article className="data-card"><Upload /><div><h3>Восстановить из файла</h3><p>Сначала файл будет проверен. Текущие данные не изменятся при ошибке.</p></div><input ref={fileRef} hidden type="file" accept="application/json,.json" onChange={(e) => chooseFile(e.target.files?.[0])} /><button className="secondary" onClick={() => fileRef.current?.click()}>Выбрать файл</button></article>{error && <p className="form-error">{error} Исходные данные сохранены.</p>}{candidate && <div className="restore-preview"><h3>Файл проверен</h3><p>{candidate.groups.length} групп, {candidate.products.length} продуктов, {candidate.periods.length} периодов.</p><p>Восстановление заменит текущие данные содержимым резервной копии. Перед продолжением можно сохранить текущую копию.</p><button className="primary full" onClick={restore}>Подтвердить восстановление</button></div>}<button className="secondary full" onClick={onClose}>Закрыть</button></div>;
}

function productWord(count: number) { const mod10 = count % 10; const mod100 = count % 100; return mod10 === 1 && mod100 !== 11 ? "продукт" : mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14) ? "продукта" : "продуктов"; }
