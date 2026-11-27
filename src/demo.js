export function demoVault() {
  const initial = {
    'Innboks/Velkommen.md': '# Velkommen til SyvendeSans\n\nPrøv å åpne et notat, bytte fane og skrive en linje. Bruk **Synk nå** for å lagre i denne nettleseren.\n\n- Finn et notat med hurtigåpneren\n- Utforsk kommandoene i paletten\n- Åpne Innstillinger og prøv et annet tema\n\nBytt til lesemodus og åpne [[Prosjekter/Verksted|verkstednotatet]].',
    'Prosjekter/Verksted.md': '# Verksted\n\n- [x] Tegne første skisse\n- [ ] Måle benken\n- [ ] Lage en mal\n',
    'Dagbok/Fredag.md': '# Fredag\n\nNoter én ting du vil huske til neste uke.\n',
  };
  const key = 'syv.demo.files';
  const files = JSON.parse(localStorage.getItem(key) ?? 'null') ??
    Object.fromEntries(Object.entries(initial).map(([path, text]) => [path, { text, sha: crypto.randomUUID() }]));
  return {
    async connect() {
      return { ref: 'demo', paths: Object.keys(files).filter(path => /\.md$/i.test(path)) };
    },
    async read(path) {
      if (Object.hasOwn(files, path)) return files[path];
      const error = new Error('Filen finnes ikke i demoen.');
      error.status = 404;
      throw error;
    },
    async readBinary() {
      throw new Error('Åpne et GitHub-vault med en STL- eller STEP-fil for å vise en 3D-modell.');
    },
    async write(path, _ref, text, sha) {
      if (files[path]?.sha !== sha) throw new Error('Filen er endret. Utkastet er beholdt.');
      const next = { text, sha: crypto.randomUUID() };
      localStorage.setItem(key, JSON.stringify({ ...files, [path]: next }));
      files[path] = next;
      return next.sha;
    },
  };
}
