export function available(c={},p){return (!c.all||c.all.every(x=>p.dlc.includes(x)))&&(!c.any||c.any.some(x=>p.dlc.includes(x)))&&(!c.versions||c.versions.includes(p.version))}
export function applicable(tasks,c,p){return tasks.filter(t=>available(t.condition,p)&&(!t.after||c.date>=t.after)&&(!t.choice||c.choices?.includes(t.choice)))}
export function validateImport(x){if(x?.format!==1||!Array.isArray(x.campaigns)||x.campaigns.length>100)throw Error('Ongeldig exportformaat');for(const c of x.campaigns)if(typeof c.id!=='string'||typeof c.country!=='string'||typeof c.route!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(c.date)||!Array.isArray(c.done)||c.done.some(t=>typeof t!=='string')||typeof c.notes!=='string'||c.notes.length>100000)throw Error('Ongeldige campagne');return x}

export function searchText(value){return String(value).normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase()}
