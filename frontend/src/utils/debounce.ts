// src/utils/debounce.ts
export function debounce<TArgs extends unknown[]>(func: (...args: TArgs) => void, wait: number): (...args: TArgs) => void {
    let timeout: ReturnType<typeof setTimeout>;
    return (...args: TArgs) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

