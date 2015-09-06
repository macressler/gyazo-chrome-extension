'use strict'
var host = 'https://upload.gyazo.com/api/upload/easy_auth'
var clientId = 'df9edab530e84b4c56f9fcfa209aff1131c7d358a91d85cc20b9229e515d67dd'
var UploadNotification = function (callback) {
  this.update = function (option, callback) {
    callback = callback || function () {}
    chrome.tabs.query({currentWindow: true, active: true}, function (tab) {
      option.action = 'notification'
      chrome.tabs.sendMessage(tab[0].id, option, callback)
    })
  }
  this.finish = function (imagePageUrl, callback) {
    this.update({
      title: chrome.i18n.getMessage('uploadingFinishTitle'),
      message: chrome.i18n.getMessage('uploadingFinishMessage'),
      imagePageUrl: imagePageUrl,
      imageUrl: imagePageUrl + '/raw',
      isFinish: true
    }, callback)
  }.bind(this)
  this.update({
    message: chrome.i18n.getMessage('uploadingMessage')
  }, callback)
}

function postToGyazo (data) {
  var notification = new UploadNotification()
  $.ajax({
    type: 'POST',
    url: host,
    data: {
      client_id: clientId,
      image_url: data.imageData,
      title: data.title,
      referer_url: data.url,
      width: data.width || '',
      height: data.height || '',
      scale: data.scale || ''
    },
    crossDomain: true
  })
    .done(function (data) {
      // Use pure XHR for get XHR.responseURL
      let xhr = new window.XMLHttpRequest()
      xhr.open('GET', data.get_image_url)
      xhr.onreadystatechange = function () {
        if (xhr.readyState === 4) {
          saveToClipboard(xhr.responseURL)
          notification.finish(xhr.responseURL)
        }
      }
      xhr.send()
    })
    .fail(function (XMLHttpRequest, textStatus, errorThrown) {
      window.alert('Status: ' + XMLHttpRequest.status + '\n Error: ' + textStatus + '\n Message: ' + errorThrown.message)
    })
}

function onClickHandler (info, tab) {
  chrome.tabs.insertCSS(tab.id, {
    file: './libs/menu.css'
  })
  var GyazoFuncs = {gyazoIt: function () {
    var xhr = jQuery.ajaxSettings.xhr()
    xhr.open('GET', info.srcUrl, true)
    xhr.responseType = 'blob'
    xhr.onreadystatechange = function () {
      if (xhr.readyState === 4) {
        var blob = xhr.response
        var fileReader = new FileReader()
        fileReader.onload = function (e) {
          postToGyazo({
            imageData: fileReader.result,
            title: tab.title,
            url: tab.url
          })
        }
        fileReader.readAsDataURL(blob)
      }
    }
    xhr.send()
  }
}
  if (info.menuItemId in GyazoFuncs) {
    GyazoFuncs[info.menuItemId]()
  }
}

chrome.tabs.onUpdated.addListener(function (tabId, changeInfo) {
  if (changeInfo.status === 'complete') {
    chrome.tabs.executeScript(tabId, {
      file: './content.js'
    }, function () {})
  }
})
/*
chrome.contextMenus.onClicked.addListener(onClickHandler)

chrome.contextMenus.create({
  title: chrome.i18n.getMessage('contextMenuImage'),
  id: 'gyazoIt',
  contexts: ['image']
})

chrome.browserAction.onClicked.addListener(function (tab) {
  chrome.tabs.insertCSS(tab.id, {
    file: './libs/menu.css'
  }, function () {
    chrome.tabs.sendMessage(tab.id, {action: 'insertMenu', tab: tab}, function () {})
  })
})
*/
chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
  var messageHandlers = {
    gyazoSendRawImage: function () {
      let data = request.data
      onClickHandler({
        menuItemId: 'gyazoIt',
        srcUrl: data.srcUrl
      }, request.tab)
    },
    gyazoCaptureWithSize: function () {
      var c = document.createElement('canvas')
      c.height = request.data.h
      c.width = request.data.w * request.data.z * request.data.s
      var canvasData = c.toDataURL()
      var capture = function (scrollHeight, lastImageBottom) {
        var imagePositionTop = lastImageBottom || scrollHeight * request.data.z * request.data.s
        var offsetTop = request.data.y - request.data.positionY
        if (scrollHeight === 0 && offsetTop >= 0 && offsetTop + request.data.h <= request.data.innerHeight) {
          // Capture in window (not require scroll)
          chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (data) {
            canvasUtils.trimImage({
              imageData: data,
              scale: request.data.s,
              zoom: request.data.z,
              startX: request.data.x - request.data.positionX,
              startY: offsetTop,
              width: request.data.w,
              height: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
              callback: function (_canvas) {
                canvasUtils.appendImageToCanvas({
                  canvasData: canvasData,
                  imageSrc: _canvas.toDataURL(),
                  pageHeight: request.data.h,
                  imageHeight: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
                  width: request.data.w,
                  top: 0,
                  scale: request.data.s,
                  zoom: request.data.z,
                  callback: function (_canvas) {
                    canvasData = _canvas.toDataURL()
                    scrollHeight += request.data.innerHeight
                    capture(scrollHeight)
                  }
                })
              }
            })
          })
          return true
        }
        if (scrollHeight >= request.data.h) {
          chrome.tabs.executeScript(null, {
            code: 'window.scrollTo(' + request.data.positionX + ', ' + request.data.positionY + ' )'
          })
          postToGyazo({
            imageData: canvasData,
            title: request.data.t,
            url: request.data.u,
            width: request.data.w,
            height: request.data.h,
            scale: request.data.s
          })
          return sendResponse()
        }
        chrome.tabs.executeScript(null, {
          code: 'window.scrollTo(' + request.data.positionX + ', ' + (scrollHeight + request.data.y) + ' )'
        }, function () {
          chrome.tabs.sendMessage(request.tab.id, {
            action: 'changeFixedElementToAbsolute',
            scrollTo: {x: request.data.positionX, y: scrollHeight + request.data.y}
          }, function (message) {
            chrome.tabs.captureVisibleTab(null, {format: 'png'}, function (data) {
              canvasUtils.trimImage({
                imageData: data,
                scale: request.data.s,
                zoom: request.data.z,
                startX: request.data.x - request.data.positionX,
                startY: 0,
                width: request.data.w,
                height: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
                callback: function (_canvas) {
                  canvasUtils.appendImageToCanvas({
                    canvasData: canvasData,
                    imageSrc: _canvas.toDataURL(),
                    pageHeight: request.data.h,
                    imageHeight: Math.min(request.data.innerHeight, request.data.h - scrollHeight),
                    width: request.data.w,
                    top: imagePositionTop,
                    scale: request.data.s,
                    zoom: request.data.z,
                    callback: function (_canvas, lastImageBottom) {
                      canvasData = _canvas.toDataURL()
                      scrollHeight += request.data.innerHeight
                      capture(scrollHeight, lastImageBottom)
                    }
                  })
                }
              })
            })
          })
        })
      }
      capture(0)
    }
  }
  if (request.action in messageHandlers) {
    messageHandlers[request.action]()
    return true
  }
})
