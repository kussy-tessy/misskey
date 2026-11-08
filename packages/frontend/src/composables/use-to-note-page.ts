import { ref } from 'vue';
import { useRouter } from '@/router.js';

export function useToNotePage() {
  const router = useRouter();
  const startX = ref(0);
  const startY = ref(0);
  const dragThreshold = 5;

  const onPointerDown = (event: PointerEvent) => {
    startX.value = event.clientX;
    startY.value = event.clientY;
  };

  const onPointerUp = (id: string, event: PointerEvent) => {
    const diffX = Math.abs(event.clientX - startX.value);
    const diffY = Math.abs(event.clientY - startY.value);

    if (diffX >= dragThreshold || diffY >= dragThreshold) return;

    const ignoreSelector = 'a, button, video, input, .media-list';

    if ((event.target as Element).closest(ignoreSelector)) return;

    router.push(`/notes/${id}`);
  };

  return { onPointerDown, onPointerUp };
}