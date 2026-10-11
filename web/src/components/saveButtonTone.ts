export const saveButtonToneClass = (saved: boolean) =>
  saved
    ? "border-success text-success bg-success/10"
    : "border-accent text-accent hover:bg-accent/10";
