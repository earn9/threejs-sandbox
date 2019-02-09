THREE.ValveLoader = function ( manager ) {

	this.manager = ( manager !== undefined ) ? manager : THREE.DefaultLoadingManager;

};

THREE.ValveLoader.prototype = {

	constructor: THREE.ValveLoader,

	load: function ( url, onLoad, onProgress, onError ) {

		function reverseInPlace( array ) {

			const halfLen = array.length / 2;
			for ( let i = 0, i2 = array.length - 1; i < halfLen; i ++, i2 -- ) {

				const tmp = array[ i ];
				array[ i ] = array[ i2 ];
				array[ i2 ] = tmp;

			}

			return array;

		}

		function toGeometryIndex( vtxBuffer, model, mesh, stripGroup, strip ) {

			const vtxDataView = new DataView( vtxBuffer );
			const indexArray = new Uint32Array( indexCount );

			for ( let i = 0, l = strip.numIndices; i < l; i ++ ) {

				const index = strip.indexOffset + i;
				const index2 = vtxDataView.getUint16( stripGroup.indexDataStart + index * 2, true );
				const index3 = vtxDataView.getUint16( stripGroup.vertexDataStart + index2 * 9 + 4, true );
				const index4 = mesh.vertexOffset + index3;

				indexArray[ i ] = index4;

			}

			// vertex buffer start
			// model.vertexOffset -- cached from something but what? The VVD file? If from VVD then it's not relevant

			reverseInPlace( indexArray );

			return new THREE.BufferAttribute( indexArray, 1, false );

		}

		const mdlpr = new Promise( ( resolve, reject ) => {

			new THREE.MDLLoader( this.manager ).load( `${ url }.mdl`, resolve, undefined, reject );

		} );

		const vvdpr = new Promise( ( resolve, reject ) => {

			new THREE.VVDLoader( this.manager ).load( `${ url }.vvd`, resolve, undefined, reject );

		} );

		const vtxpr = new Promise( ( resolve, reject ) => {

			new THREE.VTXLoader( this.manager ).load( `${ url }.dx90.vtx`, resolve, undefined, reject );

		} );

		Promise
			.all( [ mdlpr, vvdpr, vtxpr ] )
			.then( ( [ mdl, vvd, vtx ] ) => {

				const promises = [];
				const vmtLoader = new THREE.VMTLoader( this.manager );
				const tokens = url.split( 'models' );
				tokens.pop();

				const path = tokens.join( 'models' ) + 'materials/';
				mdl.textureDirectories.forEach( f => {

					mdl.textures.forEach( t => {

						const vmtUrl = `${ path }${ f }${ t }.vmt`;
						const pr = new Promise( resolve => {

							vmtLoader.load( vmtUrl, material => {

								material.name = t;
								resolve( material );

							}, undefined, () => resolve( null ) );

						} );
						promises.push( pr );

					} );

				} );

				return Promise
					.all( promises )
					.then( materials => {

						materials = materials.filter( m => ! ! m );
						return { materials, mdl, vvd, vtx };

					} );

			} )
			.then( ( { mdl, vvd, vtx, materials } ) => {

				if ( mdl.header.checksum !== vvd.header.checksum || mdl.header.checksum !== vtx.header.checksum ) {

					console.warn( 'ValveLoader: File checksums do not match.' );

				}

				const group = new THREE.Group();

				// https://github.com/ValveSoftware/source-sdk-2013/blob/master/sp/src/utils/vrad/vradstaticprops.cpp#L1504-L1688
				
				if ( mdl.numbodyparts !== vtx.numBodyParts ) {
				
					console.warn( 'ValveLoader: Number of body parts does not match.' );						
				
				}

				vtx.bodyParts.forEach( ( vtxBodyPart, i ) => {

					var mdlBodyPart = mdl.bodyParts[ i ];
					if ( mdlBodyPart.nummodels !== vtxBodyPart.numModels ) {
				
						console.warn( 'ValveLoader: Number of models does not match.' );						
					
					}
					
					vtxBodyPart.models.forEach( ( vtxModel, i2 ) => {

						var mdlModel = mdlBodyPart.models[ i2 ];

						if ( vvd.vertexDataStart !== mdlModel.vertexOffset ) {

							console.warn( 'ValveLoader: Cached MDL model vertex offset does not match VVD vertex data start.' );

						}

						vtxModel.lods.forEach( ( vtxLod, i3 ) => {

							if ( i3 !== 0 ) return;

							if ( mdlModel.nummeshes !== vtxLod.numMeshes ) {
				
								console.warn( 'ValveLoader: Number of meshes does not match.' );						
							
							}

							vtxLod.meshes.forEach( ( vtxMesh, i4 ) => {

								var mdlMesh = mdlModel.meshes[ i4 ];
								vtxMesh.stripGroups.forEach( vtxStripGroup => {

									var obj = new THREE.Object3D();

									vtxStripGroup.strips.forEach( vtxStrip => {

										// if ( s.indexOffset !== 0 || s.numIndices === 0 ) return;
										// console.log( vtxStrip.flags, vtxStrip );



										// TODO: for some reason the indices seem to be garbage?
										// Probably because we're not using the strip index and vert offsets
										var indexAttr = toGeometryIndex( vtx.buffer, mdlModel, mdlMesh, vtxStripGroup, vtxStrip );
										var geometry = new THREE.BufferGeometry();
										geometry.setIndex( indexAttr );
										geometry.addAttribute( 'position', vvd.attributes.position );
										geometry.addAttribute( 'uv', vvd.attributes.uv );
										geometry.addAttribute( 'normal', vvd.attributes.normal );

										// TODO : Winding order seems incorrect causing normals to face the wrong direction
										// the and faces to be inverted

										// geometry.addGroup( s.numIndices, s.indexOffset, 0 );

										// var mesh = new THREE.Points( geometry, new THREE.PointsMaterial( { size: .1 } ) );
										var mesh = new THREE.Mesh( geometry, materials[ 0 ] );
										if ( vtxStrip.flags & 2 ) mesh.drawMode = THREE.TriangleStripDrawMode;

										// console.log(mesh)
										obj.add( mesh );

									} );

									group.add( obj );

								} );

							} );

						} );

					} );

				} );

				onLoad( group );


			} );

	}

};
