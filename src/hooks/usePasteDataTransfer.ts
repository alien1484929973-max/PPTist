import { mediaUploadErrorMessage } from '@/services/media'
import useCreateElement from './useCreateElement'
import useImport from './useImport'
import useMediaUpload from './useMediaUpload'
import message from '@/utils/message'

export default () => {
  const { createImageElement, createVideoElement, createAudioElement } = useCreateElement()
  const { importSpecificFile, importPPTXFile } = useImport()
  const { upload, uploadImage } = useMediaUpload()

  const pasteDataTransfer = (dataTransfer: DataTransfer) => {
    const dataItems = dataTransfer.items
    const dataTransferFirstItem = dataItems[0]

    // 检查事件对象中是否存在有效文件，存在则插入对应数据，否则可继续检查是否存在文字
    let isFile = false

    for (const item of dataItems) {
      if (item.kind === 'file') {
        if (item.type.indexOf('image') !== -1) {
          const imageFile = item.getAsFile()
          if (imageFile) {
            uploadImage(imageFile)
              .then(asset => createImageElement(asset.publicUrl))
              .catch(error => message.error(mediaUploadErrorMessage(error)))
            isFile = true
          }
        }
        else if (item.type.indexOf('video') !== -1) {
          const videoFile = item.getAsFile()
          if (videoFile) {
            upload(videoFile, 'video')
              .then(asset => createVideoElement(asset.publicUrl, asset.extension))
              .catch(error => message.error(mediaUploadErrorMessage(error)))
            isFile = true
          }
        }
        else if (item.type.indexOf('audio') !== -1) {
          const audioFile = item.getAsFile()
          if (audioFile) {
            upload(audioFile, 'audio')
              .then(asset => createAudioElement(asset.publicUrl, asset.extension))
              .catch(error => message.error(mediaUploadErrorMessage(error)))
            isFile = true
          }
        }
      }
    }

    if (!isFile && dataTransferFirstItem && dataTransferFirstItem.kind === 'file') {
      if (!isFile && dataTransferFirstItem.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation') {
        const pptxFile = dataTransferFirstItem.getAsFile()
        if (pptxFile) {
          importPPTXFile([pptxFile])
          isFile = true
        }
      }
      else if (!isFile) {
        const unknownFile = dataTransferFirstItem.getAsFile()

        if (unknownFile && unknownFile.name) {
          const ext = unknownFile.name.split('.').pop() || ''

          if (ext === 'pptist') {
            importSpecificFile([unknownFile])
            isFile = true
          }
        }
      }
    }

    return { isFile, dataTransferFirstItem }
  }

  return {
    pasteDataTransfer,
  }
}
