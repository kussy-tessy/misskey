import { ref } from 'vue';
import { useRouter } from '@/router.js';

const startX = ref(0);
const startY = ref(0);
const dragThreshold = 5;

export const onPointerDown = (event: PointerEvent) => {
  startX.value = event.clientX;
  startY.value = event.clientY;
};

export const onPointerUp = (id: string, event: PointerEvent) => {
  const diffX = Math.abs(event.clientX - startX.value);
  const diffY = Math.abs(event.clientY - startY.value);
  if (diffX < dragThreshold && diffY < dragThreshold) {
    toNotePage(id, event);
  }
};

const router = useRouter();
function toNotePage(id: string, e: MouseEvent){
	const ignoreSelector = "a, button, video, input, .media-list";
	const isIgnored = (e.target as Element).closest(ignoreSelector);
	if (!isIgnored){
		router.push(`/notes/${id}`);
	}
}