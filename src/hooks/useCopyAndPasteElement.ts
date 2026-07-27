import { storeToRefs } from 'pinia'
import { useMainStore, useSlidesStore } from '@/store'
import { copyText, readClipboard } from '@/utils/clipboard'
import { encrypt } from '@/utils/crypto'
import message from '@/utils/message'
import usePasteTextClipboardData from '@/hooks/usePasteTextClipboardData'
import useDeleteElement from './useDeleteElement'

export default () => {
  const mainStore = useMainStore()
  const slidesStore = useSlidesStore()
  const { activeElementIdList, activeElementList } = storeToRefs(mainStore)
  const { currentSlide } = storeToRefs(slidesStore)

  const { pasteTextClipboardData } = usePasteTextClipboardData()
  const { deleteElement } = useDeleteElement()

  // 将选中元素数据加密后复制到剪贴板
  const copyElement = async () => {
    if (!activeElementIdList.value.length) return false

    const text = encrypt(JSON.stringify({
      type: 'elements',
      data: activeElementList.value,
      sourceSlideId: currentSlide.value.id,
    }))

    await copyText(text)
    mainStore.setEditorareaFocus(true)
    return true
  }

  // 将选中元素复制后删除（剪切）
  const cutElement = async () => {
    if (!await copyElement()) return
    deleteElement()
  }

  // 尝试将剪贴板元素数据解密后进行粘贴
  const pasteElement = () => {
    readClipboard().then(text => {
      pasteTextClipboardData(text)
    }).catch(err => message.warning(err))
  }

  // 将选中元素复制后立刻粘贴
  const quickCopyElement = async () => {
    if (!await copyElement()) return
    pasteElement()
  }

  return {
    copyElement,
    cutElement,
    pasteElement,
    quickCopyElement,
  }
}
